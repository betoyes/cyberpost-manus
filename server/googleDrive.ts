import { JWT } from "google-auth-library";
import { ENV } from "./_core/env";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export type DriveFile = {
  buffer: Buffer;
  contentType: string;
};

let cachedClient: JWT | null = null;

const getClient = (): JWT => {
  if (!ENV.googleServiceAccountJson) {
    throw new Error("GOOGLE_SA_JSON is not configured");
  }
  if (!cachedClient) {
    const credentials = JSON.parse(ENV.googleServiceAccountJson);
    cachedClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [DRIVE_READONLY_SCOPE],
    });
  }
  return cachedClient;
};

/**
 * Own Google Drive reader (Service Account). Replaces the Manus Python
 * executor's Drive access — see HANDOFF_INDEPENDENCIA_MANUS.md §2.1.
 * Returns null when no file with that name exists in the folder.
 */
export async function downloadDriveImage(params: {
  filename: string;
  folderId: string;
}): Promise<DriveFile | null> {
  const { filename, folderId } = params;
  const client = getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain Google Drive access token");

  const escapedName = filename.replace(/'/g, "\\'");
  const query = `name='${escapedName}' and '${folderId}' in parents and trashed=false`;
  const listUrl = new URL(`${DRIVE_API_BASE}/files`);
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("fields", "files(id,name,mimeType)");
  listUrl.searchParams.set("pageSize", "1");

  const listResponse = await fetch(listUrl, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!listResponse.ok) {
    const detail = await listResponse.text().catch(() => "");
    throw new Error(
      `Drive files.list failed: ${listResponse.status} ${listResponse.statusText} – ${detail}`
    );
  }

  const listData = (await listResponse.json()) as {
    files?: Array<{ id: string; mimeType?: string }>;
  };
  const file = listData.files?.[0];
  if (!file) return null;

  const getUrl = new URL(`${DRIVE_API_BASE}/files/${file.id}`);
  getUrl.searchParams.set("alt", "media");

  const getResponse = await fetch(getUrl, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!getResponse.ok) {
    const detail = await getResponse.text().catch(() => "");
    throw new Error(
      `Drive files.get failed: ${getResponse.status} ${getResponse.statusText} – ${detail}`
    );
  }

  const arrayBuffer = await getResponse.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: file.mimeType || "application/octet-stream",
  };
}
