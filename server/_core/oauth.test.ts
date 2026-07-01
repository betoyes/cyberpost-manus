import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const mockGetToken = vi.fn();
const mockVerifyIdToken = vi.fn();

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    getToken: mockGetToken,
    verifyIdToken: mockVerifyIdToken,
  })),
}));

vi.mock("../db", () => ({
  upsertUser: vi.fn(),
}));

vi.mock("./sdk", () => ({
  sdk: { createSessionToken: vi.fn() },
}));

vi.mock("./cookies", () => ({
  getSessionCookieOptions: vi.fn(() => ({
    httpOnly: true,
    path: "/",
    sameSite: "none" as const,
    secure: true,
  })),
}));

import * as db from "../db";
import { sdk } from "./sdk";
import { registerOAuthRoutes } from "./oauth";

const REDIRECT_URI = "https://app.example.com/api/oauth/callback";
const STATE = Buffer.from(REDIRECT_URI).toString("base64");

const makeReqRes = (query: Record<string, string>) => {
  const req = { query, headers: {} } as unknown as Request;
  const res = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json: vi.fn(),
    cookie: vi.fn(),
    redirect: vi.fn(),
  } as unknown as Response & {
    statusCode: number;
    json: ReturnType<typeof vi.fn>;
    cookie: ReturnType<typeof vi.fn>;
    redirect: ReturnType<typeof vi.fn>;
  };
  return { req, res };
};

const getCallbackHandler = () => {
  let handler: (req: Request, res: Response) => Promise<void>;
  const app = {
    get: (_path: string, fn: typeof handler) => {
      handler = fn;
    },
  } as any;
  registerOAuthRoutes(app);
  return handler!;
};

describe("registerOAuthRoutes /api/oauth/callback (Google)", () => {
  beforeEach(() => {
    mockGetToken.mockReset();
    mockVerifyIdToken.mockReset();
    vi.mocked(db.upsertUser).mockReset();
    vi.mocked(sdk.createSessionToken).mockReset();
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.EMAIL_OWNER = "owner@example.com";
  });

  it("returns 400 when code or state is missing", async () => {
    const handler = getCallbackHandler();
    const { req, res } = makeReqRes({});

    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it("returns 500 when Google OAuth is not configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const handler = getCallbackHandler();
    const { req, res } = makeReqRes({ code: "abc", state: STATE });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
  });

  it("rejects login from a non-owner Google account", async () => {
    mockGetToken.mockResolvedValue({ tokens: { id_token: "id-token" } });
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "g-123",
        email: "stranger@example.com",
        name: "Stranger",
      }),
    });

    const handler = getCallbackHandler();
    const { req, res } = makeReqRes({ code: "abc", state: STATE });

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(db.upsertUser).not.toHaveBeenCalled();
    expect(sdk.createSessionToken).not.toHaveBeenCalled();
  });

  it("creates an admin session for the owner email", async () => {
    mockGetToken.mockResolvedValue({ tokens: { id_token: "id-token" } });
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "g-123",
        email: "owner@example.com",
        name: "Owner",
      }),
    });
    vi.mocked(sdk.createSessionToken).mockResolvedValue("jwt-session-token");

    const handler = getCallbackHandler();
    const { req, res } = makeReqRes({ code: "abc", state: STATE });

    await handler(req, res);

    expect(db.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "g-123",
        email: "owner@example.com",
        loginMethod: "google",
        role: "admin",
      })
    );
    expect(sdk.createSessionToken).toHaveBeenCalledWith(
      "g-123",
      expect.objectContaining({ name: "Owner" })
    );
    expect(res.cookie).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, "/");
  });

  it("returns 400 when Google does not return an id_token", async () => {
    mockGetToken.mockResolvedValue({ tokens: {} });

    const handler = getCallbackHandler();
    const { req, res } = makeReqRes({ code: "abc", state: STATE });

    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it("matches the owner email case-insensitively", async () => {
    mockGetToken.mockResolvedValue({ tokens: { id_token: "id-token" } });
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "g-123",
        email: "Owner@Example.com",
        name: "Owner",
      }),
    });
    vi.mocked(sdk.createSessionToken).mockResolvedValue("jwt-session-token");

    const handler = getCallbackHandler();
    const { req, res } = makeReqRes({ code: "abc", state: STATE });

    await handler(req, res);

    expect(res.redirect).toHaveBeenCalledWith(302, "/");
  });
});
