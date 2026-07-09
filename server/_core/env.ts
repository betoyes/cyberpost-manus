export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Base URL for approval links sent by email (e.g. https://cyberpost.manus.space)
  // and for public image URLs handed to the Instagram Graph API (§2).
  // PENDENTE-MANUS: set PUBLIC_BASE_URL in production environment.
  // Getter so tests can set process.env after module load (same pattern as queueApiToken).
  get publicBaseUrl() {
    return process.env.PUBLIC_BASE_URL ?? "";
  },
  // Own LLM provider (replaces Manus Forge API — HANDOFF_INDEPENDENCIA_MANUS.md §4).
  // Getters so tests can set process.env after module load (same pattern as queueApiToken).
  get openaiApiKey() {
    return process.env.OPENAI_API_KEY ?? "";
  },
  get llmModel() {
    return process.env.LLM_MODEL ?? "gpt-4o-mini";
  },
  // Own transactional email provider (replaces Manus Notification Service — §3).
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "";
  },
  // Fallback recipient when settings.approval_email is not configured.
  // Also doubles as the only email allowed to log in (HANDOFF_INDEPENDENCIA_MANUS.md §6B —
  // own Google login, single-owner app).
  get emailOwner() {
    return process.env.EMAIL_OWNER ?? "";
  },
  // Own login provider (Google Sign-In). Replaces the Manus OAuth portal — §6B.
  // .trim() guards against accidental leading/trailing whitespace or newlines
  // when pasting the value into Railway (a common cause of invalid_client).
  get googleClientId() {
    return (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  },
  get googleClientSecret() {
    return (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  },
  // Shared secret token to authenticate the execution-queue API used by the Manus executor.
  // Getter so tests can set process.env.QUEUE_API_TOKEN after module load.
  get queueApiToken() {
    return process.env.QUEUE_API_TOKEN ?? "";
  },
  // Shared secret for the JOBS bridge (/api/bridge/*): lets the JOBS "brain"
  // originate an already-approved post from a public image URL (produced by the
  // Artista factory). Getter so tests can set process.env after module load.
  get bridgeApiToken() {
    return process.env.BRIDGE_API_TOKEN ?? "";
  },
  // Optional defense-in-depth allowlist of hostnames the bridge will accept an
  // imageUrl from (comma-separated). Empty = allow any public http(s) host
  // (default). Set to the Artista CDN host(s) once known.
  get allowedImageHosts(): string[] {
    return (process.env.ALLOWED_IMAGE_HOSTS ?? "")
      .split(",")
      .map(h => h.trim().toLowerCase())
      .filter(Boolean);
  },
  // Own executor (Google Drive read + Instagram publish) — replaces the Manus
  // Python executor script. HANDOFF_INDEPENDENCIA_MANUS.md §2.
  get googleServiceAccountJson() {
    return process.env.GOOGLE_SA_JSON ?? "";
  },
  get driveFolderId() {
    return process.env.DRIVE_FOLDER_ID ?? "";
  },
  // Cloudflare R2 (S3-compatible) — public host for images the JOBS bridge sends
  // as bytes (server/r2.ts). Replaces the dead Manus Forge storage for the bridge.
  // .trim() guards against pasted whitespace (same reason as the Google getters).
  get r2AccountId() {
    return (process.env.R2_ACCOUNT_ID ?? "").trim();
  },
  get r2AccessKeyId() {
    return (process.env.R2_ACCESS_KEY_ID ?? "").trim();
  },
  get r2SecretAccessKey() {
    return (process.env.R2_SECRET_ACCESS_KEY ?? "").trim();
  },
  get r2Bucket() {
    return (process.env.R2_BUCKET ?? "").trim();
  },
  // Public read URL of the bucket (the R2.dev subdomain or a custom domain), e.g.
  // https://pub-xxxx.r2.dev — the base the Instagram Graph API fetches the image from.
  get r2PublicBaseUrl() {
    return (process.env.R2_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  },
};
