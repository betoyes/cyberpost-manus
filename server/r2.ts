import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ENV } from "./_core/env";

/**
 * Cloudflare R2 (S3-compatible) — the public image host for arts the JOBS bridge
 * hands over as bytes. Replaces the dead Manus Forge storage for the bridge path.
 *
 * The uploaded object is read publicly via the bucket's R2.dev subdomain (or a
 * custom domain) — that public URL is what the Instagram Graph API fetches. R2 is
 * durable (unlike an ephemeral container disk), so a scheduled post keeps its image
 * even across a Postador restart.
 */

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  const accountId = ENV.r2AccountId;
  const accessKeyId = ENV.r2AccessKeyId;
  const secretAccessKey = ENV.r2SecretAccessKey;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 config missing: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY",
    );
  }
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

/** True when every R2 setting needed to upload + serve is present. */
export function r2Configured(): boolean {
  return Boolean(
    ENV.r2AccountId &&
      ENV.r2AccessKeyId &&
      ENV.r2SecretAccessKey &&
      ENV.r2Bucket &&
      ENV.r2PublicBaseUrl,
  );
}

/**
 * Upload image bytes to R2 and return the PUBLIC URL Instagram can fetch.
 * `key` should be unique (callers derive it from a content hash).
 */
export async function r2PutImage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  if (!ENV.r2Bucket) throw new Error("R2 config missing: set R2_BUCKET");
  if (!ENV.r2PublicBaseUrl) {
    throw new Error("R2 config missing: set R2_PUBLIC_BASE_URL");
  }
  await client().send(
    new PutObjectCommand({
      Bucket: ENV.r2Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${ENV.r2PublicBaseUrl}/${key}`;
}
