import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import * as db from "./db";
import { decidePost, shouldSendMissingAlert } from "./engine";

/**
 * The 30-minute Heartbeat handler — the "brain" routine.
 *
 * This runs ON THE APP SERVER (no Manus agent, no Manus credits). On each run it:
 *  1. Picks the OLDEST due post (queue logic) that is actionable.
 *  2. Resolves the caption with strict priority (manual > approved AI > halt).
 *  3. Sets the proper status:
 *      - "Fluxo Parado" when there is no manual caption and no approved AI caption
 *        for a post whose mode requires it (and notifies owner).
 *      - "Aguardando Aprovação" when an AI caption was generated and needs email approval.
 *      - Leaves a "ready-to-post" order in the execution queue for the Manus executor
 *        (consumed by the Tue/Thu schedule) when a valid caption exists.
 *  4. Handles the 6-hour missing-image alert cadence (the Manus executor reports
 *     image presence back via the callback API; this handler only manages cadence/state).
 *
 * Idempotent: re-running does not double-post. The "ready" state is a flag the
 * executor flips to "Postado" via callback, so a repeated cron run just re-confirms.
 */
export async function cron30Handler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const now = Date.now();
    const post = await db.getOldestDuePost(now);

    if (!post) {
      return res.json({ ok: true, processed: 0, reason: "no-due-posts" });
    }

    // If the post is currently flagged as missing image, handle the 6h alert cadence.
    if (post.status === "Erro: Imagem Ausente") {
      if (shouldSendMissingAlert(post.lastMissingAlertAt ?? null, now)) {
        await db.updatePost(post.id, { lastMissingAlertAt: now });
        await db.addLog({
          postId: post.id,
          kind: "warning",
          message: `Imagem ainda ausente para "${post.filename}". Alerta de 6h enviado.`,
        });
        await notifyOwner({
          title: "CybersecCAST: imagem ausente",
          content: `A arte "${post.filename}" agendada ainda não foi encontrada na pasta CybersecCAST. Coloque-a no Drive ou responda o e-mail com o anexo. O fluxo NÃO avança para o próximo post até isso ser resolvido.`,
        });
      }
      // Do NOT advance the queue — blocked post stays at the front.
      return res.json({ ok: true, processed: 1, postId: post.id, state: "missing-image" });
    }

    // If already halted, keep it halted (do not advance queue).
    if (post.status === "Fluxo Parado") {
      return res.json({ ok: true, processed: 1, postId: post.id, state: "halted" });
    }

    // Decide what this post needs.
    const decision = await decidePost(post);

    if (decision.action === "halt") {
      await db.updatePost(post.id, { status: "Fluxo Parado", note: decision.reason });
      await db.addLog({ postId: post.id, kind: "error", message: `Fluxo parado: ${decision.reason}` });
      await notifyOwner({
        title: "CybersecCAST: fluxo parado",
        content: `O post "${post.filename}" foi interrompido. Motivo: ${decision.reason}`,
      });
      return res.json({ ok: true, processed: 1, postId: post.id, state: "halted" });
    }

    if (decision.action === "need-approval-email") {
      // Mark waiting for approval. The Manus executor sends the actual email
      // (and reads replies) via Gmail connector; here we only set state + cadence.
      await db.updatePost(post.id, { status: "Aguardando Aprovação" });
      await db.addLog({
        postId: post.id,
        kind: "approval",
        message: `Legenda de IA gerada para "${post.filename}". Aguardando aprovação por e-mail.`,
      });
      return res.json({ ok: true, processed: 1, postId: post.id, state: "awaiting-approval" });
    }

    // decision.action === "ready-to-post"
    // Leave it ready; the executor (Manus Tue/Thu schedule) will fetch the
    // execution queue, download the art, post to Instagram, and call back.
    await db.addLog({
      postId: post.id,
      kind: "info",
      message: `Post "${post.filename}" pronto para publicação (${decision.captionKind}). Aguardando janela de execução.`,
    });
    return res.json({
      ok: true,
      processed: 1,
      postId: post.id,
      state: "ready-to-post",
      captionKind: decision.captionKind,
    });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
