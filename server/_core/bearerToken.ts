/**
 * Constant-time Bearer-token check for machine-to-machine REST endpoints
 * (the /api/queue/* executor bridge and the /api/bridge/* JOBS bridge).
 *
 * Returns false when no expected token is configured — a missing shared secret
 * must never authenticate a caller. The comparison is length-guarded and
 * constant-time to avoid leaking the token through timing.
 */
export function bearerTokenMatches(
  authHeader: string | undefined,
  expected: string
): boolean {
  if (!expected) return false;
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer "))
    return false;
  const token = authHeader.slice(7).trim();
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++)
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
