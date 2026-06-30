import type { Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { createHeartbeatJob, deleteHeartbeatJob } from "./_core/heartbeat";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import * as db from "./db";
import { generateCaption } from "./caption";

/**
 * Convert a UTC epoch ms timestamp to a 6-field cron expression that fires
 * once at that exact date/time (UTC). Format: "0 min hour dom mon *".
 *
 * The cron is recurring by nature, so the handler self-deletes after firing
 * to achieve one-shot semantics. See references/periodic-updates.md §4.1.
 */
export function scheduledAtToCron(ms: number): string {
  const d = new Date(ms);
  const min = d.getUTCMinutes();
  const hour = d.getUTCHours();
  const dom = d.getUTCDate();
  const mon = d.getUTCMonth() + 1;
  return `0 ${min} ${hour} ${dom} ${mon} *`;
}

export function getSessionToken(req: Request): string {
  return parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
}

/**
 * Create a one-shot Heartbeat cron for a post at its exact scheduled time.
 * If a cron already exists for this post, delete it first (spec §4.1).
 * Returns the new taskUid to persist on the post row.
 */
export async function schedulePostJob(
  postId: number,
  scheduledAt: number,
  sessionToken: string
): Promise<string> {
  const cron = scheduledAtToCron(scheduledAt);
  const job = await createHeartbeatJob(
    {
      name: `post-${postId}`,
      cron,
      path: "/api/scheduled/runPost",
      payload: { postId },
      description: `Disparo no horário exato para post #${postId}`,
    },
    sessionToken
  );
  return job.taskUid;
}

/**
 * Cancel the Heartbeat cron for a post. Idempotent — ignores errors if the
 * cron was already deleted or never existed.
 */
export async function cancelPostJob(scheduleCronTaskUid: string): Promise<void> {
  try {
    await deleteHeartbeatJob(scheduleCronTaskUid, "");
  } catch {
    // Already deleted or not found — treated as success
  }
}

/**
 * POST /api/scheduled/runPost
 *
 * Fired by the Manus Heartbeat platform at the post's exact scheduled time.
 * Authenticated via sdk.authenticateRequest (user.isCron = true, user.taskUid set).
 *
 * Decision rules (spec §1):
 *   Rule 3 — no manual caption (IA mode): generate AI caption inline, mark
 *             Aguardando Aprovação, notify owner. Executor sends email + posts after approval.
 *   Rules 1+2 — manual caption present or manual mode: release to executor queue.
 *               Executor checks image in Drive and publishes to Instagram.
 *
 * Self-deletes the cron after firing (one-shot behavior via deleteHeartbeatJob).
 */
export async function runPostHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const taskUid = user.taskUid;
    const post = await db.getPostByScheduleUid(taskUid);

    if (!post) {
      // Orphan: post was deleted or uid cleared — return 2xx so forge stops retrying
      return res.json({ ok: true, skipped: "orphan" });
    }

    // Auto-cleanup: delete the one-time cron and clear uid on post row
    await cancelPostJob(taskUid);
    await db.updatePost(post.id, { scheduleCronTaskUid: null });

    const hasManualCaption = Boolean(post.captionManual?.trim());
    const isAiMode = post.mode === "aprovar" || post.mode === "auto";

    // Rule 3: IA mode without manual caption — generate caption, await approval
    if (isAiMode && !hasManualCaption) {
      const theme = (post.theme ?? "").trim();

      if (!theme) {
        await db.updatePost(post.id, {
          status: "Fluxo Parado",
          note: "Horário agendado atingido sem tema para geração de legenda de IA.",
        });
        await db.addLog({
          postId: post.id,
          kind: "warning",
          message: `Horário agendado atingido para "${post.filename}": sem tema — fluxo parado.`,
        });
        await notifyOwner({
          title: "CybersecCAST: post sem tema",
          content: `"${post.filename}" chegou ao horário agendado sem tema configurado. Fluxo parado — edite o post.`,
        });
        return res.json({ ok: true, action: "halted-no-theme" });
      }

      const caption = await generateCaption(theme);
      await db.updatePost(post.id, {
        captionAi: caption,
        status: "Aguardando Aprovação",
        captionApproved: false,
      });
      await db.addLog({
        postId: post.id,
        kind: "ia",
        message: `Horário agendado atingido: legenda de IA gerada para "${post.filename}". Aguardando aprovação por e-mail.`,
      });
      await notifyOwner({
        title: "CybersecCAST: legenda gerada no horário agendado",
        content: `"${post.filename}" chegou ao horário agendado. Legenda de IA gerada e enviada para aprovação.`,
      });
      return res.json({ ok: true, action: "awaiting-approval" });
    }

    // Rules 1+2: manual caption present or manual mode — executor handles Drive + Instagram
    await db.addLog({
      postId: post.id,
      kind: "disparo",
      message: `Horário agendado atingido para "${post.filename}". Liberado para o executor verificar imagem e publicar.`,
    });
    // post remains Pendente with scheduledAt now in the past → executor picks it up via /api/queue/next
    return res.json({ ok: true, action: "queued-for-executor" });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
