export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Own login provider: Google Sign-In (HANDOFF_INDEPENDENCIA_MANUS.md §6B).
// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  return url.toString();
};
