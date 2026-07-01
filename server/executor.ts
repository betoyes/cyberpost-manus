import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";
import * as db from "./db";
import { resolveCaption } from "./engine";
import { triggerAiApprovalFlow } from "./schedulePost";
import { downloadDriveImage } from "./googleDrive";
import { publishImageToInstagram } from "./instagramGraph";
import { storagePut } from "./storage";

/**
 * Own executor: applies the 3 owner rules and, when ready, downloads the
 * image from Google Drive and publishes to Instagram — replacing the Manus
 * Python executor script. HANDOFF_INDEPENDENCIA_MANUS.md §2/§5.
 */
export async function runExecutionForPost(postId: number): Promise<void> {
  const post = await db.getPost(postId);
  if (!post) return;

  const hasManualCaption = Boolean(post.captionManual?.trim());
  const isAiMode = post.mode === "aprovar" || post.mode === "auto";

  // Rule 3: IA mode without manual caption — generate caption, await approval.
  // Checked before resolveCaption, which would otherwise "halt" a post that
  // has no caption at all yet (the exact scenario Rule 3 exists to handle).
  if (isAiMode && !hasManualCaption) {
    await triggerAiApprovalFlow(post);
    return;
  }

  const cap = resolveCaption(post);
  if (cap.kind === "halt") {
    // Nothing to do yet (e.g. AI caption pending approval); leave status as-is.
    return;
  }

  // Rules 1+2: manual caption present or manual mode — download from Drive
  // and publish to Instagram. Account + token are validated up front so a
  // misconfigured setup never wastes a Drive API call.
  const account = await db.resolvePostAccount(post);
  if (!account?.igUserId) {
    await db.updatePost(postId, {
      status: "Fluxo Parado",
      note: "Nenhuma conta Instagram configurada (cadastre em Contas Instagram).",
    });
    await db.addLog({
      postId,
      kind: "error",
      message: `Nenhuma conta Instagram configurada para "${post.filename}". Fluxo parado.`,
    });
    await notifyOwner({
      title: "CybersecCAST: conta Instagram ausente",
      content: `"${post.filename}" não pôde ser publicado: nenhuma conta Instagram configurada.`,
    });
    return;
  }

  const metaToken = await db.getSetting("meta_access_token");
  if (!metaToken) {
    await db.updatePost(postId, {
      status: "Fluxo Parado",
      note: "Token do Meta não configurado (ver tela de Contas Instagram).",
    });
    await db.addLog({
      postId,
      kind: "error",
      message: `Token do Meta não configurado para "${post.filename}". Fluxo parado.`,
    });
    await notifyOwner({
      title: "CybersecCAST: token Meta ausente",
      content: `"${post.filename}" não pôde ser publicado: token do Meta não configurado.`,
    });
    return;
  }

  let driveFile;
  try {
    driveFile = await downloadDriveImage({
      filename: post.filename,
      folderId: ENV.driveFolderId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.updatePost(postId, {
      status: "Fluxo Parado",
      note: `Erro ao acessar o Google Drive: ${message}`,
    });
    await db.addLog({
      postId,
      kind: "error",
      message: `Erro ao acessar o Google Drive para "${post.filename}": ${message}`,
    });
    await notifyOwner({
      title: "CybersecCAST: erro na publicação",
      content: `Falha ao publicar "${post.filename}". Detalhe: ${message}`,
    });
    return;
  }

  if (!driveFile) {
    await db.updatePost(postId, {
      status: "Erro: Imagem Ausente",
      note: "Imagem não encontrada na pasta do Drive.",
    });
    await db.addLog({
      postId,
      kind: "warning",
      message: `Imagem ausente para "${post.filename}".`,
    });
    return;
  }

  try {
    const uploaded = await storagePut(
      `posts/${post.filename}`,
      driveFile.buffer,
      driveFile.contentType
    );
    const publicImageUrl = `${ENV.publicBaseUrl}${uploaded.url}`;

    const result = await publishImageToInstagram({
      igUserId: account.igUserId,
      imageUrl: publicImageUrl,
      caption: cap.caption,
      accessToken: metaToken,
    });

    await db.updatePost(postId, {
      status: "Postado",
      instagramId: result.mediaId,
      permalink: result.permalink,
      imageUrl: uploaded.url,
      imageStorageKey: uploaded.key,
      note: null,
    });
    await db.addLog({
      postId,
      kind: "posted",
      message: `Publicado no Instagram${result.permalink ? `: ${result.permalink}` : ""}`,
    });
    await notifyOwner({
      title: "CybersecCAST: post publicado",
      content: `"${post.filename}" foi publicado no Instagram.${
        result.permalink ? ` Link: ${result.permalink}` : ""
      }`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.updatePost(postId, {
      status: "Fluxo Parado",
      note: message,
    });
    await db.addLog({
      postId,
      kind: "error",
      message: `Erro na execução: ${message}`,
    });
    await notifyOwner({
      title: "CybersecCAST: erro na publicação",
      content: `Falha ao publicar "${post.filename}". Detalhe: ${message}`,
    });
  }
}
