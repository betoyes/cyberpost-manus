import type { Request, Response } from "express";
import { notifyOwner } from "./_core/notification";
import * as db from "./db";

const VALID_DECISIONS = new Set(["approve", "reject"]);

/**
 * GET /api/approval/:postId/:token?decision=approve|reject
 *
 * Public endpoint (no session) — called when the owner clicks the confirmation
 * button on the /aprovacao/confirmar page (not directly from the email link,
 * to guard against email-client prefetch).
 *
 * Security:
 *   - Token is validated against posts.approvalToken (set at caption-generation time).
 *   - Action is only accepted when post.status === "Aguardando Aprovação".
 *   - Token is cleared after use (single-use).
 *
 * On success: redirects to /aprovacao?status=approved|rejected&file=<filename>
 * On failure: redirects to /aprovacao?status=error&reason=<reason>
 */
export async function approvalGetHandler(req: Request, res: Response) {
  const postId = parseInt(req.params.postId ?? "", 10);
  const token = (req.params.token ?? "").trim();
  const decision = (req.query.decision as string | undefined) ?? "";

  if (isNaN(postId) || !token || !VALID_DECISIONS.has(decision)) {
    return res.redirect("/aprovacao?status=error&reason=invalid-request");
  }

  let post: Awaited<ReturnType<typeof db.getPost>>;
  try {
    post = await db.getPost(postId);
  } catch {
    return res.redirect("/aprovacao?status=error&reason=server-error");
  }

  if (
    !post ||
    post.approvalToken !== token ||
    post.status !== "Aguardando Aprovação"
  ) {
    return res.redirect("/aprovacao?status=error&reason=invalid-token");
  }

  const filename = post.filename;

  try {
    if (decision === "approve") {
      await db.updatePost(postId, {
        captionApproved: true,
        status: "Pendente",
        approvalToken: null,
        note: null,
      });
      await db.addLog({
        postId,
        kind: "approval",
        message: `Legenda APROVADA por link no e-mail para "${filename}". Post voltou para Pendente.`,
      });
      await notifyOwner({
        title: "CybersecCAST: legenda aprovada",
        content: `Você aprovou a legenda de "${filename}". Será publicada na próxima execução do executor.`,
      });
      return res.redirect(
        `/aprovacao?status=approved&file=${encodeURIComponent(filename)}`
      );
    }

    // decision === "reject"
    await db.updatePost(postId, {
      captionApproved: false,
      status: "Fluxo Parado",
      approvalToken: null,
      note: "Legenda reprovada via link no e-mail.",
    });
    await db.addLog({
      postId,
      kind: "approval",
      message: `Legenda REPROVADA por link no e-mail para "${filename}". Fluxo parado.`,
    });
    await notifyOwner({
      title: "CybersecCAST: legenda reprovada",
      content: `Você reprovou a legenda de "${filename}". Edite a legenda manual no painel para desbloquear o post.`,
    });
    return res.redirect(
      `/aprovacao?status=rejected&file=${encodeURIComponent(filename)}`
    );
  } catch {
    return res.redirect("/aprovacao?status=error&reason=server-error");
  }
}
