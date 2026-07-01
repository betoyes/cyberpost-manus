import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Own login provider: Google Sign-In. Replaces the Manus OAuth portal —
 * HANDOFF_INDEPENDENCIA_MANUS.md §6B. This app has a single owner/admin, so
 * login is hard-restricted to ENV.emailOwner; any other Google account is
 * rejected before a session is ever created.
 */
export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    if (!ENV.googleClientId || !ENV.googleClientSecret) {
      res.status(500).json({ error: "Google OAuth is not configured" });
      return;
    }

    try {
      const redirectUri = atob(state);
      const client = new OAuth2Client({
        clientId: ENV.googleClientId,
        clientSecret: ENV.googleClientSecret,
        redirectUri,
      });

      // Safe diagnostic log for invalid_client troubleshooting — never logs
      // the secret itself, only length/prefix metadata plus the redirectUri.
      console.log("[OAuth] Google token exchange debug", {
        clientIdLength: ENV.googleClientId.length,
        clientIdLast12: ENV.googleClientId.slice(-12),
        clientSecretLength: ENV.googleClientSecret.length,
        clientSecretHasGocspxPrefix: ENV.googleClientSecret.startsWith("GOCSPX-"),
        redirectUri,
      });

      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) {
        res.status(400).json({ error: "Google did not return an id_token" });
        return;
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: ENV.googleClientId,
      });
      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email) {
        res.status(400).json({ error: "Google profile missing sub/email" });
        return;
      }

      if (
        !ENV.emailOwner ||
        payload.email.toLowerCase() !== ENV.emailOwner.toLowerCase()
      ) {
        console.warn(
          `[OAuth] Rejected Google login from non-owner email: ${payload.email}`
        );
        res
          .status(403)
          .json({ error: "Conta não autorizada para este painel" });
        return;
      }

      await db.upsertUser({
        openId: payload.sub,
        name: payload.name || null,
        email: payload.email,
        loginMethod: "google",
        lastSignedIn: new Date(),
        role: "admin",
      });

      const sessionToken = await sdk.createSessionToken(payload.sub, {
        name: payload.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.redirect(302, "/");
    } catch (error) {
      const googleErrorData = (error as { response?: { data?: unknown } })
        ?.response?.data;
      console.error("[OAuth] Google callback failed", error);
      if (googleErrorData) {
        console.error("[OAuth] Google error response data", googleErrorData);
      }
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
