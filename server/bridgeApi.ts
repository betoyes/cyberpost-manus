import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import { bearerTokenMatches } from "./_core/bearerToken";
import * as db from "./db";
import { createHash } from "node:crypto";
import { r2PutImage } from "./r2";

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

/** Max decoded size accepted via imageBase64 (Instagram's own image limit is ~8MB). */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Sniff PNG / JPEG / WebP from magic bytes; null if unrecognized. */
function sniffImageType(buf: Buffer): { ext: string; mime: string } | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) {
    return { ext: "png", mime: "image/png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

/**
 * Decode the art bytes (base64, optionally a data: URL), validate them, store on
 * the Postador's own storage (same backend/URL the legacy Drive flow publishes
 * from), and return the PUBLIC URL Instagram can fetch. Hosting the art here is
 * exactly the Fase-3 wiring: JOBS/Artista hand over the bytes, the Postador is the
 * public host — no external URL to manage.
 */
async function hostBase64Image(imageBase64: string, filename: string): Promise<string> {
  const b64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new Error("imageBase64 is not valid base64");
  }
  if (buf.length === 0) throw new Error("imageBase64 decoded to empty bytes");
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new Error(`image exceeds ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB`);
  }
  const type = sniffImageType(buf);
  if (!type) throw new Error("image must be PNG, JPEG, or WebP");
  const safeName = (filename.replace(/[^\w.-]/g, "_").slice(0, 80) || "art").replace(
    /\.(png|jpe?g|webp)$/i,
    "",
  );
  // Content hash → a unique, stable key (re-posting the same art reuses the object).
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  return r2PutImage(`bridge/${safeName}-${hash}.${type.ext}`, buf, type.mime);
}

/**
 * Max decoded size accepted via videoBase64. Cap fica < que o body-limit do express
 * (50mb, e base64 infla ~33%): 30MB decodificado ≈ 40MB de payload, com folga. Um
 * reel vertical curto do Avatar Studio cabe de sobra.
 */
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

/** Sniff MP4/MOV (Reels do IG exigem MP4/MOV); null se não reconhecer. */
function sniffVideoType(buf: Buffer): { ext: string; mime: string } | null {
  // ISO base media (MP4/MOV/M4V): "ftyp" no offset 4.
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    return { ext: "mp4", mime: "video/mp4" };
  }
  return null;
}

/**
 * r2.dev pode levar segundos pra servir um objeto INÉDITO (propagação). Como o
 * Instagram baixa a mídia logo depois, um HEAD-check best-effort reduz o container
 * ERROR de "URL não acessível" — mais crítico no vídeo (arquivo maior). Nunca falha:
 * se não servir a tempo, segue (o IG tem retry próprio no processamento do container).
 */
async function waitUrlServable(url: string, attempts = 6, intervalMs = 1000): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { method: "HEAD" });
      if (r.ok) return;
    } catch {
      /* rede — tenta de novo */
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Decodifica os bytes do vídeo, valida (MP4, tamanho) e hospeda no R2 → URL pública. */
async function hostBase64Video(videoBase64: string, filename: string): Promise<string> {
  const b64 = videoBase64.replace(/^data:[^;]+;base64,/, "");
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new Error("videoBase64 is not valid base64");
  }
  if (buf.length === 0) throw new Error("videoBase64 decoded to empty bytes");
  if (buf.length > MAX_VIDEO_BYTES) {
    throw new Error(`video exceeds ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))}MB`);
  }
  const type = sniffVideoType(buf);
  if (!type) throw new Error("video must be MP4/MOV");
  const safeName = (filename.replace(/[^\w.-]/g, "_").slice(0, 80) || "reel").replace(
    /\.(mp4|mov|m4v)$/i,
    "",
  );
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  const url = await r2PutImage(`bridge/${safeName}-${hash}.${type.ext}`, buf, type.mime);
  await waitUrlServable(url);
  return url;
}

type BridgePostBody = {
  imageUrl?: unknown;
  imageBase64?: unknown;
  videoUrl?: unknown; // reel: URL http(s) pública do vídeo
  videoBase64?: unknown; // reel: bytes do vídeo (hospedados no R2, como a imagem)
  media?: unknown; // "image" | "reel" (default: inferido pelo que veio)
  caption?: unknown;
  filename?: unknown;
  accountId?: unknown;
  scheduledAt?: unknown;
};

/**
 * POST /api/bridge/post
 * Body (imagem OU reel — a mídia vem por bytes base64, hospedada no R2, ou por URL pública):
 *   imageBase64 | imageUrl   — imagem (PNG/JPEG/WebP)
 *   videoBase64 | videoUrl   — reel (MP4/MOV); ativa mediaType="reel"
 *   media?:     "image"|"reel" — força o tipo (default: inferido pelo que veio)
 *   caption:    string  (required) — the approved caption (<= 2200 chars)
 *   filename?:  string            — human label for logs/emails (default derived)
 *   accountId?: number            — target Instagram account (default = default account)
 *   scheduledAt?: number          — unix ms; default now (publish on next worker tick)
 */
export async function bridgePostHandler(req: Request, res: Response) {
  try {
    if (!authorized(req))
      return res.status(401).json({ error: "unauthorized" });

    const body = (req.body ?? {}) as BridgePostBody;

    const filenameHint =
      typeof body.filename === "string" && body.filename.trim().length > 0
        ? body.filename.trim()
        : "art";

    // Reel (vídeo) ou imagem? Inferido pelo que veio (ou forçado por `media`). Em
    // ambos os casos há duas formas de entregar a mídia: base64 (o Postador hospeda
    // no R2 e publica de lá — o caminho Fase 3) ou uma URL http(s) já pública.
    const wantsReel =
      body.media === "reel" ||
      (typeof body.videoBase64 === "string" && body.videoBase64.length > 0) ||
      isPublicHttpUrl(body.videoUrl);

    // A URL pública da mídia (imagem OU vídeo) vai em `imageUrl` — a coluna já
    // existe e o executor escolhe o publisher por `mediaType`. Sem migração.
    let imageUrl: string;
    const mediaType: "image" | "reel" = wantsReel ? "reel" : "image";
    if (wantsReel) {
      if (typeof body.videoBase64 === "string" && body.videoBase64.length > 0) {
        try {
          imageUrl = await hostBase64Video(body.videoBase64, filenameHint);
        } catch (e) {
          return res.status(400).json({ error: (e as Error).message });
        }
      } else if (isPublicHttpUrl(body.videoUrl)) {
        imageUrl = body.videoUrl;
      } else {
        return res.status(400).json({
          error: "provide videoBase64 (reel bytes) or videoUrl (a public http(s) URL)",
        });
      }
    } else if (typeof body.imageBase64 === "string" && body.imageBase64.length > 0) {
      try {
        imageUrl = await hostBase64Image(body.imageBase64, filenameHint);
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }
    } else if (isPublicHttpUrl(body.imageUrl)) {
      imageUrl = body.imageUrl;
    } else {
      return res.status(400).json({
        error:
          "provide imageBase64/imageUrl (imagem) ou videoBase64/videoUrl (reel)",
      });
    }

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
      mediaType,
      scheduledAt,
      accountId,
    });

    await db.addLog({
      postId,
      kind: "bridge",
      message: `Post criado via ponte JOBS para "${filename}" (${mediaType === "reel" ? "reel/vídeo" : "imagem"} externo).`,
    });

    return res.json({ ok: true, postId, status: "Pendente", scheduledAt });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/bridge/accounts
 * Lista as contas Instagram ativas (id + nome + handle + qual é a padrão) para o
 * originador (Avatar Studio) deixar o operador escolher em qual publicar. NÃO
 * devolve token nenhum — os tokens vivem em settings (`meta_token:*`), não aqui.
 */
export async function bridgeAccountsHandler(req: Request, res: Response) {
  try {
    if (!authorized(req)) return res.status(401).json({ error: "unauthorized" });
    const accounts = await db.listAccounts();
    return res.json({
      ok: true,
      accounts: accounts
        .filter((a) => a.active)
        .map((a) => ({
          id: a.id,
          name: a.name,
          handle: a.handle ?? null,
          isDefault: a.isDefault,
        })),
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
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
