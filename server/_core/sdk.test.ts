import { describe, it, expect, beforeEach } from "vitest";
import type { sdk as SdkInstance } from "./sdk";

describe("sdk session tokens (createSessionToken / verifySession)", () => {
  let sdk: typeof SdkInstance;

  beforeEach(async () => {
    // ENV.cookieSecret (JWT_SECRET) is a plain property evaluated once at
    // module load, not a getter, so it must be set before the first import
    // of "./sdk" (which transitively imports "./env").
    process.env.JWT_SECRET = "test-jwt-secret";
    ({ sdk } = await import("./sdk"));
  });

  it("creates a session token that verifySession accepts when VITE_APP_ID is unset (Google login, §6B)", async () => {
    const token = await sdk.createSessionToken("g-123", { name: "Owner" });
    const session = await sdk.verifySession(token);

    expect(session).not.toBeNull();
    expect(session?.openId).toBe("g-123");
    expect(session?.name).toBe("Owner");
    expect(session?.appId).toBeTruthy();
  });

  it("rejects a session cookie with no value", async () => {
    const session = await sdk.verifySession(undefined);
    expect(session).toBeNull();
  });
});
