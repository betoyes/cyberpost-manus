export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Base URL for approval links sent by email (e.g. https://cyberpost.manus.space).
  // PENDENTE-MANUS: set PUBLIC_BASE_URL in production environment.
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
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
};
