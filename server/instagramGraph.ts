const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

export type PublishResult = {
  mediaId: string;
  permalink: string | null;
};

async function graphPost(
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const url = new URL(`${GRAPH_API_BASE}/${path}`);
  const body = new URLSearchParams(params);
  const response = await fetch(url, { method: "POST", body });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      (data?.error as { message?: string } | undefined)?.message ??
      response.statusText;
    throw new Error(
      `Instagram Graph API error (${response.status}): ${message}`
    );
  }
  return data;
}

/**
 * Own Instagram publisher (Meta Graph API). Replaces the Manus Python
 * executor's publish step — see HANDOFF_INDEPENDENCIA_MANUS.md §2.2.
 * `imageUrl` must be a public HTTPS URL the Instagram servers can fetch.
 */
export async function publishImageToInstagram(params: {
  igUserId: string;
  imageUrl: string;
  caption: string;
  accessToken: string;
}): Promise<PublishResult> {
  const { igUserId, imageUrl, caption, accessToken } = params;

  const creation = await graphPost(`${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });
  const creationId = creation.id as string | undefined;
  if (!creationId)
    throw new Error("Instagram media creation did not return an id");

  const published = await graphPost(`${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: accessToken,
  });
  const mediaId = published.id as string | undefined;
  if (!mediaId) throw new Error("Instagram media_publish did not return an id");

  let permalink: string | null = null;
  try {
    const permalinkUrl = new URL(`${GRAPH_API_BASE}/${mediaId}`);
    permalinkUrl.searchParams.set("fields", "permalink");
    permalinkUrl.searchParams.set("access_token", accessToken);
    const permalinkResponse = await fetch(permalinkUrl);
    if (permalinkResponse.ok) {
      const permalinkData = (await permalinkResponse.json()) as {
        permalink?: string;
      };
      permalink = permalinkData.permalink ?? null;
    }
  } catch {
    // Permalink is a nice-to-have; the post is already published either way.
  }

  return { mediaId, permalink };
}

export type ConnectionTestResult =
  | { ok: true; username: string | null }
  | { ok: false; message: string };

/**
 * Read-only connectivity check for the "Testar conexão Meta" button — never
 * publishes anything. Fetches basic profile fields for igUserId with the
 * given token and reports success/failure with a short, sanitized message
 * (never the token, never the raw Graph API error payload).
 */
export async function testInstagramConnection(params: {
  igUserId: string;
  accessToken: string;
}): Promise<ConnectionTestResult> {
  const { igUserId, accessToken } = params;

  try {
    const url = new URL(`${GRAPH_API_BASE}/${igUserId}`);
    url.searchParams.set("fields", "id,username");
    url.searchParams.set("access_token", accessToken);

    const response = await fetch(url);
    const data = (await response.json()) as {
      username?: string;
      error?: { message?: string; type?: string; code?: number };
    };

    if (!response.ok) {
      const summary =
        data?.error?.message?.slice(0, 200) ??
        `HTTP ${response.status} ${response.statusText}`;
      return { ok: false, message: summary };
    }

    return { ok: true, username: data.username ?? null };
  } catch {
    // A network-level error's message could theoretically embed the request
    // URL (which carries access_token as a query param) — never echo it back.
    return { ok: false, message: "Falha de rede ao conectar com a Meta API." };
  }
}
