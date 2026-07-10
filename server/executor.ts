import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";
import * as db from "./db";
import { resolveCaption } from "./engine";
import { triggerAiApprovalFlow } from "./schedulePost";
import { downloadDriveImage } from "./googleDrive";
import { publishImageToInstagram } from "./instagramGraph";
import { publishImageToLinkedIn } from "./linkedinApi";
import { storagePut } from "./storage";
import type { ResolvedAccount } from "./db";

/** Rótulo humano da plataforma da conta, pras mensagens de erro/notificação. */
function platformLabel(account: ResolvedAccount): string {
  return account.platform === "linkedin" ? "LinkedIn" : "Instagram";
}

/**
 * Token da conta, por plataforma. Instagram: token por-conta `meta_token:<igUserId>`
 * (cai no global `meta_access_token`). LinkedIn: token do admin da Página
 * `linkedin_token:<orgId>` (sem global — cada organização tem o seu). Um token não
 * serve pra duas contas, então cada conta guarda o seu.
 */
async function resolveAccountToken(
  account: ResolvedAccount
): Promise<string | null> {
  if (account.platform === "linkedin") {
    return account.igUserId
      ? await db.getSetting(`linkedin_token:${account.igUserId}`)
      : null;
  }
  return (
    (account.igUserId
      ? await db.getSetting(`meta_token:${account.igUserId}`)
      : null) || (await db.getSetting("meta_access_token"))
  );
}

/**
 * Publica na plataforma certa da conta e normaliza o retorno pro mesmo formato
 * (`mediaId` guarda o id/URN do post; `permalink` o link público). Centraliza o
 * ÚNICO ponto que diverge entre Instagram e LinkedIn.
 */
async function publishForAccount(
  account: ResolvedAccount,
  accessToken: string,
  imageUrl: string,
  caption: string
): Promise<{ mediaId: string; permalink: string | null }> {
  if (account.platform === "linkedin") {
    if (!account.igUserId) {
      throw new Error("Conta LinkedIn sem Organization ID configurado.");
    }
    const result = await publishImageToLinkedIn({
      orgId: account.igUserId,
      imageUrl,
      caption,
      accessToken,
    });
    return { mediaId: result.postUrn, permalink: result.permalink };
  }
  if (!account.igUserId) {
    throw new Error("Conta Instagram sem IG User ID configurado.");
  }
  const result = await publishImageToInstagram({
    igUserId: account.igUserId,
    imageUrl,
    caption,
    accessToken,
  });
  return { mediaId: result.mediaId, permalink: result.permalink };
}

/**
 * A bridge-sourced post carries its image as an absolute public http(s) URL in
 * `imageUrl` (set by /api/bridge/post — the JOBS bridge). Drive-sourced posts
 * leave `imageUrl` null until posting and then store a RELATIVE storage key, so
 * this predicate cleanly routes the two without a schema change.
 */
function isExternalSourceUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

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

  // Token POR CONTA e POR PLATAFORMA. Instagram: `meta_token:<igUserId>` (cai no
  // global `meta_access_token`). LinkedIn: `linkedin_token:<orgId>`. Necessário no
  // multi-conta: cada conta tem seu próprio token (um token não publica em várias),
  // então CybersecCAST, Sunny e a Company Page do LinkedIn publicam sem se derrubar.
  const accessToken = await resolveAccountToken(account);
  if (!accessToken) {
    const label = platformLabel(account);
    await db.updatePost(postId, {
      status: "Fluxo Parado",
      note: `Token do ${label} não configurado (ver tela de Contas).`,
    });
    await db.addLog({
      postId,
      kind: "error",
      message: `Token do ${label} não configurado para "${post.filename}". Fluxo parado.`,
    });
    await notifyOwner({
      title: `CybersecCAST: token ${label} ausente`,
      content: `"${post.filename}" não pôde ser publicado: token do ${label} não configurado.`,
    });
    return;
  }

  // Bridge posts (JOBS): the art already lives at a public URL (Artista). Publish
  // it straight from there and skip Google Drive entirely.
  if (isExternalSourceUrl(post.imageUrl)) {
    try {
      const result = await publishForAccount(
        account,
        accessToken,
        post.imageUrl,
        cap.caption
      );
      await db.updatePost(postId, {
        status: "Postado",
        instagramId: result.mediaId,
        permalink: result.permalink,
        note: null,
      });
      await db.addLog({
        postId,
        kind: "posted",
        message: `Publicado no Instagram${
          result.permalink ? `: ${result.permalink}` : ""
        }`,
      });
      await notifyOwner({
        title: "CybersecCAST: post publicado",
        content: `"${post.filename}" foi publicado no Instagram.${
          result.permalink ? ` Link: ${result.permalink}` : ""
        }`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.updatePost(postId, { status: "Fluxo Parado", note: message });
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

    const result = await publishForAccount(
      account,
      accessToken,
      publicImageUrl,
      cap.caption
    );

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
