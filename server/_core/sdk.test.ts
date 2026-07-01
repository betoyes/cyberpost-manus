import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request } from "express";
import { COOKIE_NAME } from "@shared/const";
import type { sdk as SdkInstance } from "./sdk";

const mockPost = vi.fn();

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({ post: mockPost })),
  },
}));

vi.mock("../db", () => ({
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

import * as db from "../db";

const makeReq = (cookieValue: string): Request =>
  ({
    headers: { cookie: `${COOKIE_NAME}=${cookieValue}` },
  }) as unknown as Request;

describe("sdk session tokens (createSessionToken / verifySession)", () => {
  let sdk: typeof SdkInstance;

  beforeEach(async () => {
    // ENV.cookieSecret (JWT_SECRET) is a plain property evaluated once at
    // module load, not a getter, so it must be set before the first import
    // of "./sdk" (which transitively imports "./env").
    process.env.JWT_SECRET = "test-jwt-secret";
    mockPost.mockReset();
    vi.mocked(db.getUserByOpenId).mockReset();
    vi.mocked(db.upsertUser).mockReset();
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

  describe("authenticateRequest — Google sessions skip the legacy Manus sync", () => {
    it("does not call the legacy Manus GetUserInfoWithJwt sync when the Google user already exists in the DB", async () => {
      vi.mocked(db.getUserByOpenId).mockResolvedValue({
        id: 1,
        openId: "g-123",
        name: "Owner",
        email: "owner@example.com",
        loginMethod: "google",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      } as any);
      vi.mocked(db.upsertUser).mockResolvedValue(undefined as any);

      const token = await sdk.createSessionToken("g-123", {
        name: "Owner",
        loginMethod: "google",
      });

      const user = await sdk.authenticateRequest(makeReq(token));

      expect(user.openId).toBe("g-123");
      // The legacy sync hits the Manus OAuth server via this axios client —
      // it must never be called for a Google-origin session.
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("throws instead of crashing when a Google session's user is missing from the DB, without calling the legacy sync", async () => {
      vi.mocked(db.getUserByOpenId).mockResolvedValue(undefined);

      const token = await sdk.createSessionToken("g-999", {
        name: "Ghost",
        loginMethod: "google",
      });

      await expect(sdk.authenticateRequest(makeReq(token))).rejects.toThrow();

      expect(mockPost).not.toHaveBeenCalled();
      expect(db.upsertUser).not.toHaveBeenCalled();
    });

    it("still attempts the legacy Manus sync for a session with no loginMethod (backward compatibility)", async () => {
      vi.mocked(db.getUserByOpenId).mockResolvedValue(undefined);
      mockPost.mockResolvedValue({ data: {} });

      const token = await sdk.createSessionToken("manus-user-1", {
        name: "Legacy User",
      });

      await expect(sdk.authenticateRequest(makeReq(token))).rejects.toThrow();

      expect(mockPost).toHaveBeenCalled();
    });
  });
});
