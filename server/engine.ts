import * as db from "./db";
import { generateCaption } from "./caption";
import type { Post } from "../drizzle/schema";

/**
 * Caption resolution result.
 * - kind "manual": a manual caption exists -> highest priority, always wins.
 * - kind "ai-approved": no manual, AI caption exists AND was approved by email.
 * - kind "halt": neither manual nor approved AI caption -> stop the flow.
 */
export type CaptionResolution =
  | { kind: "manual"; caption: string }
  | { kind: "ai-approved"; caption: string }
  | { kind: "halt"; reason: string };

/**
 * Strict caption priority (spec):
 * 1. Manual caption ALWAYS takes precedence.
 * 2. AI caption only if it exists AND captionApproved === true.
 * 3. Otherwise HALT (Fluxo Parado) and alert owner.
 */
export function resolveCaption(post: Post): CaptionResolution {
  const manual = (post.captionManual ?? "").trim();
  if (manual.length > 0) return { kind: "manual", caption: manual };

  const ai = (post.captionAi ?? "").trim();
  if (ai.length > 0 && post.captionApproved) {
    return { kind: "ai-approved", caption: ai };
  }

  return {
    kind: "halt",
    reason:
      "Sem legenda manual e sem legenda de IA aprovada por e-mail. Fluxo interrompido para evitar postagem indevida.",
  };
}

/**
 * Decide what action a due post needs. This is pure decision logic;
 * the actual side-effects (Drive/Instagram/Gmail) are executed by the
 * Manus connector layer that consumes the execution queue.
 */
export type PostDecision =
  | { action: "halt"; reason: string }
  | { action: "need-approval-email"; caption: string }
  | { action: "ready-to-post"; caption: string; captionKind: "manual" | "ai-approved" };

/**
 * Determine the next decision for a post, generating the AI caption if needed.
 * - manual present -> ready to post immediately.
 * - mode auto/aprovar without approved AI -> ensure AI caption exists, then require approval.
 * - approved AI -> ready to post.
 */
export async function decidePost(post: Post): Promise<PostDecision> {
  const manual = (post.captionManual ?? "").trim();
  if (manual.length > 0) {
    return { action: "ready-to-post", caption: manual, captionKind: "manual" };
  }

  // No manual caption. For auto/aprovar modes, AI caption + approval flow applies.
  if (post.mode === "manual") {
    // Manual mode but no manual caption written -> halt.
    return {
      action: "halt",
      reason: "Modo manual selecionado, mas nenhuma legenda manual foi escrita.",
    };
  }

  // Ensure an AI caption exists.
  let aiCaption = (post.captionAi ?? "").trim();
  if (aiCaption.length === 0) {
    const theme = (post.theme ?? "").trim();
    if (theme.length === 0) {
      return {
        action: "halt",
        reason: "Sem legenda manual e sem tema/palavras-chave para gerar legenda por IA.",
      };
    }
    aiCaption = await generateCaption(theme);
    await db.updatePost(post.id, { captionAi: aiCaption });
    await db.addLog({
      postId: post.id,
      kind: "ia",
      message: "Legenda gerada por IA com base no tema.",
    });
  }

  if (post.captionApproved) {
    return { action: "ready-to-post", caption: aiCaption, captionKind: "ai-approved" };
  }

  return { action: "need-approval-email", caption: aiCaption };
}

/**
 * Approval keyword interpretation (spec, case-insensitive, exact match after trim).
 * Approve: aprovado / sim / yes. Reject: reprovado / não / nao / no.
 * Returns null when the reply does not contain a recognized decision.
 */
export function interpretApprovalReply(rawReply: string): "approve" | "reject" | null {
  const text = (rawReply ?? "").toLowerCase();
  // tokenably scan words to find an exact keyword match
  const tokens = text.split(/[^a-zà-ú]+/i).filter(Boolean);
  const approveSet = new Set(["aprovado", "sim", "yes"]);
  const rejectSet = new Set(["reprovado", "não", "nao", "no"]);
  for (const t of tokens) {
    if (approveSet.has(t)) return "approve";
    if (rejectSet.has(t)) return "reject";
  }
  return null;
}

/** 6 hours in milliseconds — cadence for missing-image alert emails. */
export const MISSING_ALERT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Whether a fresh "missing image" alert should be sent now. */
export function shouldSendMissingAlert(lastAlertAtMs: number | null, nowMs: number): boolean {
  if (!lastAlertAtMs) return true;
  return nowMs - lastAlertAtMs >= MISSING_ALERT_INTERVAL_MS;
}
