import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";
import * as db from "./db";
import { resolveCaption, interpretApprovalReply } from "./engine";
import { generateCaption } from "./caption";

/**
 * Bridge API between the app (the "brain") and the Manus executor (the "arm").
 *
 * The Manus scheduled task (Tue/Thu 8h & 17h) calls these endpoints through a
 * generic HTTP connector, authenticated with a shared bearer token
 * (QUEUE_API_TOKEN). No user session is involved.
 *
 *  GET  /api/queue/next    -> the next ready execution order (post + final caption + filename)
 *  POST /api/queue/report  -> executor reports the outcome of an order
 */

function checkToken(req: Request): boolean {
  const auth = req.headers.authorization;
  const expected = ENV.queueApiToken;
  if (!expected) return false;
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  // constant-time-ish compare
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++)
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * POST /api/queue/generate-caption
 * Token-authenticated helper to generate (or regenerate) the AI caption for a
 * post from its theme, persist it, and mark the post 'Aguardando Aprovação'.
 * Mirrors what the daily brain routine does for AI-mode posts. Body: { postId }.
 */
export async function queueGenerateCaptionHandler(req: Request, res: Response) {
  try {
    // Allow token auth in all envs; also allow local loopback calls in development
    // so the operator can trigger a one-off AI caption generation during testing.
    const isDev = process.env.NODE_ENV === "development";
    const remote = req.socket.remoteAddress ?? "";
    const isLoopback = remote.includes("127.0.0.1") || remote.includes("::1");
    if (!checkToken(req) && !(isDev && isLoopback)) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const { postId } = (req.body ?? {}) as { postId?: number };
    if (typeof postId !== "number")
      return res.status(400).json({ error: "postId required" });
    const post = await db.getPost(postId);
    if (!post) return res.status(404).json({ error: "post-not-found" });
    const theme = (post.theme ?? "").trim();
    if (theme.length === 0)
      return res.status(400).json({ error: "post has no theme" });
    const caption = await generateCaption(theme);
    await db.updatePost(postId, {
      captionAi: caption,
      status: "Aguardando Aprovação",
      captionApproved: false,
    });
    await db.addLog({
      postId,
      kind: "ia",
      message: "Legenda gerada por IA. Aguardando aprovação por e-mail.",
    });
    return res.json({ ok: true, caption });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/queue/next */
export async function queueNextHandler(req: Request, res: Response) {
  try {
    if (!checkToken(req))
      return res.status(401).json({ error: "unauthorized" });

    const now = Date.now();
    const post = await db.getNextReadyToExecute(now);
    if (!post) return res.json({ order: null });

    // Resolve final caption with strict priority. If it cannot be posted, do not
    // hand it to the executor (the cron will have already set it to halted/awaiting).
    const cap = resolveCaption(post);
    if (cap.kind === "halt") {
      return res.json({
        order: null,
        blocked: { postId: post.id, reason: cap.reason },
      });
    }

    // Resolve the account: use post.accountId, fall back to the default account.
    // Wrapped in try/catch so the queue keeps working if the accounts table
    // hasn't been migrated yet in production.
    type AccountInfo = { id: number; name: string; handle: string | null; igUserId: string | null };
    let account: AccountInfo | null = null;
    try {
      if (post.accountId) {
        const acc = await db.getAccount(post.accountId);
        if (acc)
          account = { id: acc.id, name: acc.name, handle: acc.handle ?? null, igUserId: acc.igUserId ?? null };
      }
      if (!account) {
        const def = await db.getDefaultAccount();
        if (def)
          account = { id: def.id, name: def.name, handle: def.handle ?? null, igUserId: def.igUserId ?? null };
      }
    } catch {
      // accounts table not yet migrated — continue without account info
    }

    return res.json({
      order: {
        postId: post.id,
        filename: post.filename,
        mediaType: post.mediaType,
        caption: cap.caption,
        captionKind: cap.kind,
        driveFolder: "CybersecCAST",
        accountId: post.accountId ?? null,
        account,
      },
    });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}

/**
 * POST /api/queue/approval
 * The Manus executor reads the owner's email reply (and optional attached image)
 * and reports the decision here. We interpret the keyword and update state:
 *  - approve -> captionApproved=true, status back to 'Pendente' (re-enters queue, will post)
 *  - reject  -> status 'Fluxo Parado', notify owner
 * An optional imageUrl/imageStorageKey (attachment saved to Drive) can be attached.
 */
export async function queueApprovalHandler(req: Request, res: Response) {
  try {
    if (!checkToken(req))
      return res.status(401).json({ error: "unauthorized" });

    const { postId, reply, imageUrl, imageStorageKey } = (req.body ?? {}) as {
      postId?: number;
      reply?: string;
      imageUrl?: string;
      imageStorageKey?: string;
    };
    if (typeof postId !== "number" || typeof reply !== "string") {
      return res.status(400).json({ error: "postId and reply are required" });
    }

    const post = await db.getPost(postId);
    if (!post) return res.json({ ok: true, skipped: "post-not-found" });

    const decision = interpretApprovalReply(reply);
    if (decision === null) {
      await db.addLog({
        postId,
        kind: "approval",
        message: `Resposta de e-mail sem palavra-chave reconhecida para "${post.filename}". Nenhuma ação tomada.`,
      });
      return res.json({ ok: true, decision: "unrecognized" });
    }

    if (decision === "approve") {
      await db.updatePost(postId, {
        captionApproved: true,
        status: "Pendente",
        imageUrl: imageUrl ?? post.imageUrl ?? null,
        imageStorageKey: imageStorageKey ?? post.imageStorageKey ?? null,
        note: null,
      });
      await db.addLog({
        postId,
        kind: "approval",
        message: `Legenda APROVADA por e-mail para "${post.filename}".`,
      });
      await notifyOwner({
        title: "CybersecCAST: legenda aprovada",
        content: `Você aprovou a legenda de "${post.filename}". Será publicada na próxima janela de execução.`,
      });
      return res.json({ ok: true, decision: "approve" });
    }

    // decision === "reject"
    await db.updatePost(postId, {
      status: "Fluxo Parado",
      captionApproved: false,
      note: "Legenda reprovada por e-mail.",
    });
    await db.addLog({
      postId,
      kind: "approval",
      message: `Legenda REPROVADA por e-mail para "${post.filename}". Fluxo parado.`,
    });
    await notifyOwner({
      title: "CybersecCAST: legenda reprovada",
      content: `Você reprovou a legenda de "${post.filename}". O fluxo foi parado; edite a legenda manual ou ajuste o tema para gerar uma nova.`,
    });
    return res.json({ ok: true, decision: "reject" });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}

/** POST /api/queue/report */
export async function queueReportHandler(req: Request, res: Response) {
  try {
    if (!checkToken(req))
      return res.status(401).json({ error: "unauthorized" });

    const {
      postId,
      result,
      permalink,
      instagramId,
      imageUrl,
      imageStorageKey,
      message,
    } = (req.body ?? {}) as {
      postId?: number;
      result?: "posted" | "missing-image" | "error";
      permalink?: string;
      instagramId?: string;
      imageUrl?: string;
      imageStorageKey?: string;
      message?: string;
    };

    if (typeof postId !== "number" || !result) {
      return res.status(400).json({ error: "postId and result are required" });
    }

    const post = await db.getPost(postId);
    if (!post) return res.json({ ok: true, skipped: "post-not-found" });

    if (result === "posted") {
      await db.updatePost(postId, {
        status: "Postado",
        permalink: permalink ?? null,
        instagramId: instagramId ?? null,
        imageUrl: imageUrl ?? post.imageUrl ?? null,
        imageStorageKey: imageStorageKey ?? post.imageStorageKey ?? null,
        note: null,
      });
      await db.addLog({
        postId,
        kind: "posted",
        message: `Publicado no Instagram${permalink ? `: ${permalink}` : ""}`,
      });
      await notifyOwner({
        title: "CybersecCAST: post publicado",
        content: `"${post.filename}" foi publicado no Instagram.${permalink ? ` Link: ${permalink}` : ""}`,
      });
      return res.json({ ok: true });
    }

    if (result === "missing-image") {
      await db.updatePost(postId, {
        status: "Erro: Imagem Ausente",
        note: message ?? "Imagem não encontrada na pasta CybersecCAST.",
      });
      await db.addLog({
        postId,
        kind: "warning",
        message: `Imagem ausente para "${post.filename}".`,
      });
      // The 6h alert cadence is handled by the cron handler; we just set state here.
      return res.json({ ok: true });
    }

    // result === "error"
    await db.updatePost(postId, {
      status: "Fluxo Parado",
      note: message ?? "Erro na execução.",
    });
    await db.addLog({
      postId,
      kind: "error",
      message: `Erro na execução: ${message ?? "desconhecido"}`,
    });
    await notifyOwner({
      title: "CybersecCAST: erro na publicação",
      content: `Falha ao publicar "${post.filename}". Detalhe: ${message ?? "desconhecido"}`,
    });
    return res.json({ ok: true });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
