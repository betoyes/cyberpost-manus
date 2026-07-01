import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../_core/context";

vi.mock("../db", () => ({
  listAccounts: vi.fn(),
  getDefaultAccount: vi.fn(),
  getSettingMeta: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  deleteSetting: vi.fn(),
  addLog: vi.fn(),
}));

vi.mock("../instagramGraph", () => ({
  testInstagramConnection: vi.fn(),
  publishImageToInstagram: vi.fn(),
}));

import * as db from "../db";
import {
  testInstagramConnection,
  publishImageToInstagram,
} from "../instagramGraph";
import { appRouter } from "../routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const OWNER_EMAIL = "owner@example.com";

function makeCtx(email: string): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "g-123",
    email,
    name: "Test User",
    loginMethod: "google",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("accountsRouter — Meta connection", () => {
  beforeEach(() => {
    vi.mocked(db.getDefaultAccount).mockReset();
    vi.mocked(db.getSettingMeta).mockReset();
    vi.mocked(db.getSetting).mockReset();
    vi.mocked(db.setSetting).mockReset().mockResolvedValue(undefined);
    vi.mocked(db.deleteSetting).mockReset().mockResolvedValue(undefined);
    vi.mocked(db.addLog)
      .mockReset()
      .mockResolvedValue(undefined as any);
    vi.mocked(testInstagramConnection).mockReset();
    vi.mocked(publishImageToInstagram).mockReset();
    process.env.EMAIL_OWNER = OWNER_EMAIL;
  });

  it("metaStatus never returns the token itself, only booleans + date", async () => {
    vi.mocked(db.getDefaultAccount).mockResolvedValue({
      id: 1,
      name: "CybersecCAST",
      handle: null,
      igUserId: "17841400000000000",
      platform: "instagram",
      isDefault: true,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    vi.mocked(db.getSettingMeta).mockResolvedValue({
      isSet: true,
      updatedAt: new Date("2026-07-01"),
    });

    const caller = appRouter.createCaller(makeCtx(OWNER_EMAIL));
    const result = await caller.accounts.metaStatus();

    expect(result).toEqual({
      hasDefaultAccount: true,
      igUserIdConfigured: true,
      tokenSaved: true,
      tokenUpdatedAt: new Date("2026-07-01"),
    });
    expect(Object.keys(result)).not.toContain("token");
    expect(JSON.stringify(result)).not.toMatch(/EAABw|Bearer /);
  });

  it("rejects saveMetaToken from a non-owner email", async () => {
    const caller = appRouter.createCaller(makeCtx("stranger@example.com"));

    await expect(
      caller.accounts.saveMetaToken({ token: "secret-token" })
    ).rejects.toThrow();
    expect(db.setSetting).not.toHaveBeenCalled();
  });

  it("rejects removeMetaToken from a non-owner email", async () => {
    const caller = appRouter.createCaller(makeCtx("stranger@example.com"));

    await expect(caller.accounts.removeMetaToken()).rejects.toThrow();
    expect(db.deleteSetting).not.toHaveBeenCalled();
  });

  it("rejects an empty token from the owner", async () => {
    const caller = appRouter.createCaller(makeCtx(OWNER_EMAIL));

    await expect(
      caller.accounts.saveMetaToken({ token: "  " })
    ).rejects.toThrow();
    expect(db.setSetting).not.toHaveBeenCalled();
  });

  it("owner can save a valid token; activity log never contains the token content", async () => {
    const caller = appRouter.createCaller(makeCtx(OWNER_EMAIL));

    await caller.accounts.saveMetaToken({ token: "super-secret-value" });

    expect(db.setSetting).toHaveBeenCalledWith(
      "meta_access_token",
      "super-secret-value"
    );
    expect(db.addLog).toHaveBeenCalledTimes(1);
    const logCall = vi.mocked(db.addLog).mock.calls[0][0];
    expect(logCall.message).not.toContain("super-secret-value");
  });

  it("owner can remove the token", async () => {
    const caller = appRouter.createCaller(makeCtx(OWNER_EMAIL));

    await caller.accounts.removeMetaToken();

    expect(db.deleteSetting).toHaveBeenCalledWith("meta_access_token");
  });

  it("testMetaConnection never calls publishImageToInstagram", async () => {
    vi.mocked(db.getDefaultAccount).mockResolvedValue({
      id: 1,
      name: "CybersecCAST",
      handle: null,
      igUserId: "17841400000000000",
      platform: "instagram",
      isDefault: true,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    vi.mocked(db.getSetting).mockResolvedValue("saved-token");
    vi.mocked(testInstagramConnection).mockResolvedValue({
      ok: true,
      username: "cyberseccast",
    });

    const caller = appRouter.createCaller(makeCtx(OWNER_EMAIL));
    const result = await caller.accounts.testMetaConnection();

    expect(result).toEqual({ ok: true, username: "cyberseccast" });
    expect(publishImageToInstagram).not.toHaveBeenCalled();
  });

  it("testMetaConnection returns a safe message when no default account is configured", async () => {
    vi.mocked(db.getDefaultAccount).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeCtx(OWNER_EMAIL));
    const result = await caller.accounts.testMetaConnection();

    expect(result.ok).toBe(false);
    expect(testInstagramConnection).not.toHaveBeenCalled();
  });
});
