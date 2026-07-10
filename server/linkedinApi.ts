// LinkedIn Community Management API — publica em Company Page (organização).
//
// Diferente do Instagram (graph.instagram.com, que BAIXA a imagem por URL): aqui é
// api.linkedin.com/rest, com um token de um usuário ADMIN da Página
// (permissão w_organization_social), e o autor do post é a URN da organização.
// A LinkedIn NÃO busca a imagem por URL — a gente sobe os bytes. Fluxo em 3 passos:
//   1. registra o upload da imagem   -> POST /rest/images?action=initializeUpload
//   2. sobe os bytes                 -> PUT  {uploadUrl}
//   3. cria o post com a imagem      -> POST /rest/posts  (URN volta no header x-restli-id)
//
// Docs: learn.microsoft.com/linkedin/marketing/community-management/shares/{images,posts}-api

const LINKEDIN_API_BASE = "https://api.linkedin.com/rest";

// Versão da API no formato YYYYMM. A LinkedIn faz sunset de versões antigas — se as
// chamadas começarem a falhar por versão descontinuada, bump aqui pro mês suportado
// mais recente (ver a doc "versioning"/"migrations").
const LINKEDIN_API_VERSION = "202606";

const RESTLI_PROTOCOL_VERSION = "2.0.0";

export type LinkedInPublishResult = {
  /** URN do post criado (ex.: urn:li:share:... ou urn:li:ugcPost:...). */
  postUrn: string;
  permalink: string | null;
};

function jsonHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": RESTLI_PROTOCOL_VERSION,
    "Content-Type": "application/json",
  };
}

/** Lança um erro enxuto a partir de uma resposta de erro da LinkedIn (sem vazar o token). */
async function throwLinkedInError(response: Response): Promise<never> {
  let message = response.statusText;
  try {
    const data = (await response.json()) as { message?: string };
    if (typeof data?.message === "string" && data.message) message = data.message;
  } catch {
    // corpo não-JSON — fica no statusText
  }
  throw new Error(`LinkedIn API error (${response.status}): ${message}`);
}

// Formato "little" da commentary: alguns caracteres são reservados (usados p/ menções,
// hashtags e âncoras) e precisam de escape com \ — senão a API rejeita (400/422). O \
// é o escape e NÃO aparece na renderização, então o texto sai normal pro leitor.
const LITTLE_RESERVED = /[\\<>@[\]()#*_~{}|]/g;

export function escapeCommentary(text: string): string {
  return text.replace(LITTLE_RESERVED, (char) => `\\${char}`);
}

/** Aceita já-URN (`urn:li:organization:123`) ou só o id numérico (`123`). */
export function toOrganizationUrn(orgIdOrUrn: string): string {
  const value = orgIdOrUrn.trim();
  return value.startsWith("urn:li:organization:")
    ? value
    : `urn:li:organization:${value}`;
}

/** Passo 1: registra o upload e devolve a uploadUrl + a URN da imagem. */
async function initializeImageUpload(
  ownerUrn: string,
  accessToken: string
): Promise<{ uploadUrl: string; imageUrn: string }> {
  const response = await fetch(
    `${LINKEDIN_API_BASE}/images?action=initializeUpload`,
    {
      method: "POST",
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
    }
  );
  if (!response.ok) await throwLinkedInError(response);

  const data = (await response.json()) as {
    value?: { uploadUrl?: string; image?: string };
  };
  const uploadUrl = data.value?.uploadUrl;
  const imageUrn = data.value?.image;
  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn initializeUpload não retornou uploadUrl/image.");
  }
  return { uploadUrl, imageUrn };
}

/**
 * Passo 2: sobe os bytes da imagem pra uploadUrl. `--upload-file` da doc = HTTP PUT
 * do binário cru, com o Bearer no header.
 */
async function uploadImageBytes(
  uploadUrl: string,
  bytes: Buffer,
  accessToken: string
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    // Buffer não casa com BodyInit nos tipos do fetch; Uint8Array (ArrayBufferView) casa.
    body: new Uint8Array(bytes),
  });
  if (!response.ok) await throwLinkedInError(response);
}

/**
 * Publica uma imagem numa Company Page do LinkedIn. `imageUrl` é uma URL pública
 * (ex.: R2) da qual a gente baixa os bytes — a LinkedIn exige o upload dos bytes,
 * não aceita URL. Espelha o contrato de `publishImageToInstagram`.
 */
export async function publishImageToLinkedIn(params: {
  /** id numérico da organização OU a URN completa. */
  orgId: string;
  imageUrl: string;
  caption: string;
  accessToken: string;
}): Promise<LinkedInPublishResult> {
  const ownerUrn = toOrganizationUrn(params.orgId);

  // Baixa os bytes da arte (a LinkedIn não busca por URL como o Instagram faz).
  const imageResponse = await fetch(params.imageUrl);
  if (!imageResponse.ok) {
    throw new Error(
      `Não consegui baixar a imagem (HTTP ${imageResponse.status}) para subir ao LinkedIn.`
    );
  }
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("A imagem baixada para o LinkedIn está vazia.");
  }

  const { uploadUrl, imageUrn } = await initializeImageUpload(
    ownerUrn,
    params.accessToken
  );
  await uploadImageBytes(uploadUrl, bytes, params.accessToken);

  const response = await fetch(`${LINKEDIN_API_BASE}/posts`, {
    method: "POST",
    headers: jsonHeaders(params.accessToken),
    body: JSON.stringify({
      author: ownerUrn,
      commentary: escapeCommentary(params.caption),
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      // Só o id da imagem — altText vazio dispara INVALID_VALUE_BLANK_FIELD, então omite.
      content: { media: { id: imageUrn } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!response.ok) await throwLinkedInError(response);

  // A URN do post volta no header x-restli-id (não no corpo).
  const postUrn = response.headers.get("x-restli-id");
  if (!postUrn) {
    throw new Error("LinkedIn não retornou o URN do post (header x-restli-id).");
  }

  return {
    postUrn,
    permalink: `https://www.linkedin.com/feed/update/${postUrn}/`,
  };
}
