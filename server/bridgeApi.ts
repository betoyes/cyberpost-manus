import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import { bearerTokenMatches } from "./_core/bearerToken";
import * as db from "./db";

/**
 * JOBS bridge (/api/bridge/*).
 *
 * Lets the JOBS "brain" (a local Python process, no browser session) originate a
 * post from an ALREADY-APPROVED art whose image lives at a public HTTPS URL —
 * produced upstream by the Artista factory. Authenticated by a shared
 * BRIDGE_API_TOKEN, exactly like /api/queue/* — no user session, no Google login.
 *
 * The human-approval gate lives UPSTREAM in JOBS (the editorial calendar +
 * "produz os aprovados" loop): by the time this endpoint is called, the owner
 * has already approved the art and the caption. The post is therefore created in
 * `manual` mode with the caption pre-filled, so the executor publishes it
 * directly without a second email-approval round.
 *
 * Unlike /api/queue/* (which only advances EXISTING posts), this CREATES a post
 * carrying the external `imageUrl`. The in-process executor publishes it straight
 * from that URL and skips Google Drive entirely (see server/executor.ts).
 *
 *  POST /api/bridge/post        -> create + queue a post; returns { postId, status }
 *  GET  /api/bridge/status/:id  -> read a post's publish status + recent logs
 */

/** Instagram's hard caption limit. */
const CAPTION_MAX = 2200;
/** How many recent activity-log lines the status endpoint returns for a post. */
const STATUS_LOG_LIMIT = 20;

function authorized(req: Request): boolean {
  return bearerTokenMatches(req.headers.authorization, ENV.bridgeApiToken);
}

/**
 * A syntactically valid public http(s) URL, optionally restricted to an
 * allowlisted set of hosts (ENV.allowedImageHosts, defense-in-depth). The
 * http(s) shape is also the convention the executor uses to tell a bridge-sourced
 * image (external URL, published directly) from a Drive-sourced one (relative
 * storage key).
 */
function isPublicHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const allow = ENV.allowedImageHosts;
  if (allow.length > 0 && !allow.includes(url.hostname.toLowerCase())) {
    return false;
  }
  return true;
}

type BridgePostBody = {
  imageUrl?: unknown;
  caption?: unknown;
  filename?: unknown;
  accountId?: unknown;
  scheduledAt?: unknown;
};

/**
 * POST /api/bridge/post
 * Body: {
 *   imageUrl:   string  (required) — public http(s) URL of the art to publish
 *   caption:    string  (required) — the approved caption (<= 2200 chars)
 *   filename?:  string            — human label for logs/emails (default derived)
 *   accountId?: number            — target Instagram account (default = default account)
 *   scheduledAt?: number          — unix ms; default now (publish on next worker tick)
 * }
 */
export async function bridgePostHandler(req: Request, res: Response) {
  try {
    if (!authorized(req))
      return res.status(401).json({ error: "unauthorized" });

    const body = (req.body ?? {}) as BridgePostBody;

    if (!isPublicHttpUrl(body.imageUrl)) {
      return res
        .status(400)
        .json({ error: "imageUrl is required and must be a public http(s) URL" });
    }
    const imageUrl = body.imageUrl;

    const caption =
      typeof body.caption === "string" ? body.caption.trim() : "";
    if (caption.length === 0) {
      return res.status(400).json({ error: "caption is required" });
    }
    if (caption.length > CAPTION_MAX) {
      return res
        .status(400)
        .json({ error: `caption exceeds ${CAPTION_MAX} characters` });
    }

    if (
      body.accountId !== undefined &&
      body.accountId !== null &&
      !Number.isInteger(body.accountId)
    ) {
      return res.status(400).json({ error: "accountId must be an integer" });
    }
    const accountId =
      typeof body.accountId === "number" ? body.accountId : null;

    if (
      body.scheduledAt !== undefined &&
      body.scheduledAt !== null &&
      !Number.isFinite(body.scheduledAt)
    ) {
      return res
        .status(400)
        .json({ error: "scheduledAt must be a unix-ms number" });
    }
    const scheduledAt =
      typeof body.scheduledAt === "number" ? body.scheduledAt : Date.now();

    const filename =
      typeof body.filename === "string" && body.filename.trim().length > 0
        ? body.filename.trim().slice(0, 512)
        : `jobs-${scheduledAt}`;

    const postId = await db.createPost({
      filename,
      imageUrl,
      captionManual: caption,
      // Upstream JOBS already gated approval; a manual caption needs no email round.
      captionApproved: true,
      mode: "manual",
      status: "Pendente",
      mediaType: "image",
      scheduledAt,
      accountId,
    });

    await db.addLog({
      postId,
      kind: "bridge",
      message: `Post criado via ponte JOBS para "${filename}" (imagem externa).`,
    });

    return res.json({ ok: true, postId, status: "Pendente", scheduledAt });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/bridge/status/:id
 * Returns the post's publish state plus its recent activity-log lines so JOBS
 * can report progress ("Pendente" -> "Postado" | "Fluxo Parado" | ...).
 */
export async function bridgeStatusHandler(req: Request, res: Response) {
  try {
    if (!authorized(req))
      return res.status(401).json({ error: "unauthorized" });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid post id" });
    }

    const post = await db.getPost(id);
    if (!post) return res.status(404).json({ error: "post-not-found" });

    const logs = (await db.listLogs(200))
      .filter(l => l.postId === id)
      .slice(0, STATUS_LOG_LIMIT)
      .map(l => ({
        kind: l.kind,
        message: l.message,
        createdAt: l.createdAt,
      }));

    return res.json({
      ok: true,
      post: {
        id: post.id,
        filename: post.filename,
        status: post.status,
        permalink: post.permalink ?? null,
        instagramId: post.instagramId ?? null,
        note: post.note ?? null,
        scheduledAt: post.scheduledAt ?? null,
      },
      logs,
    });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ error: err.message });
  }
}
