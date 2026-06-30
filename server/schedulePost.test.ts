import { describe, it, expect, vi, beforeEach } from "vitest";
import { scheduledAtToCron } from "./schedulePost";
import type { Post } from "../drizzle/schema";

// ── pure function tests (no mocks needed) ────────────────────────────────────

describe("scheduledAtToCron", () => {
  it("converts a known UTC datetime correctly", () => {
    // 2026-07-15 04:00 UTC
    const ms = Date.UTC(2026, 6, 15, 4, 0, 0);
    expect(scheduledAtToCron(ms)).toBe("0 0 4 15 7 *");
  });

  it("handles midnight UTC (0h 0m)", () => {
    const ms = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(scheduledAtToCron(ms)).toBe("0 0 0 1 1 *");
  });

  it("handles non-zero minutes", () => {
    const ms = Date.UTC(2026, 11, 31, 23, 45, 0);
    expect(scheduledAtToCron(ms)).toBe("0 45 23 31 12 *");
  });

  it("returns 1-indexed month (JS month 0 → cron month 1)", () => {
    const ms = Date.UTC(2026, 0, 15, 10, 30, 0);
    expect(scheduledAtToCron(ms)).toBe("0 30 10 15 1 *");
  });
});

// ── runPostHandler tests (mocked dependencies) ────────────────────────────────

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: vi.fn() },
}));
vi.mock("./db", () => ({
  getPostByScheduleUid: vi.fn(),
  updatePost: vi.fn(),
  addLog: vi.fn(),
}));
vi.mock("./_core/heartbeat", () => ({
  createHeartbeatJob: vi.fn(),
  deleteHeartbeatJob: vi.fn(),
}));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(),
}));
vi.mock("./caption", () => ({
  generateCaption: vi.fn().mockResolvedValue("Legenda gerada por IA"),
}));

import { runPostHandler } from "./schedulePost";
import { sdk } from "./_core/sdk";
import * as dbModule from "./db";
import { deleteHeartbeatJob } from "./_core/heartbeat";
import { notifyOwner } from "./_core/notification";
import { generateCaption } from "./caption";

function makePost(overrides: Partial<Post>): Post {
  const now = new Date();
  return {
    id: 1,
    filename: "art.png",
    theme: "phishing",
    mode: "aprovar",
    status: "Pendente",
    scheduledAt: Date.now() - 60_000,
    mediaType: "image",
    captionManual: null,
    captionAi: null,
    captionApproved: false,
    imageStorageKey: null,
    imageUrl: null,
    instagramId: null,
    permalink: null,
    driveFileId: null,
    approvalToken: null,
    approvalEmailSentAt: null,
    lastMissingAlertAt: null,
    accountId: null,
    scheduleCronTaskUid: "uid-abc",
    note: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Post;
}

function makeReq() {
  return { headers: { cookie: "" }, url: "/api/scheduled/runPost" } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runPostHandler", () => {
  it("rejects non-cron requests with 403", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ isCron: false } as any);
    const res = makeRes();
    await runPostHandler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "cron-only" });
  });

  it("returns skipped:orphan when no post found for taskUid (idempotency)", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ isCron: true, taskUid: "uid-gone" } as any);
    vi.mocked(dbModule.getPostByScheduleUid).mockResolvedValue(undefined);
    const res = makeRes();
    await runPostHandler(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ ok: true, skipped: "orphan" });
    expect(dbModule.updatePost).not.toHaveBeenCalled();
  });

  it("Rule 3: generates AI caption and marks Aguardando Aprovação when no manual caption", async () => {
    const post = makePost({ mode: "aprovar", captionManual: null, theme: "ransomware" });
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ isCron: true, taskUid: "uid-abc" } as any);
    vi.mocked(dbModule.getPostByScheduleUid).mockResolvedValue(post);
    vi.mocked(dbModule.updatePost).mockResolvedValue(undefined);
    vi.mocked(dbModule.addLog).mockResolvedValue(undefined as any);
    const res = makeRes();
    await runPostHandler(makeReq(), res);
    expect(generateCaption).toHaveBeenCalledWith("ransomware");
    expect(dbModule.updatePost).toHaveBeenCalledWith(
      post.id,
      expect.objectContaining({ status: "Aguardando Aprovação", captionApproved: false })
    );
    expect(notifyOwner).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true, action: "awaiting-approval" });
  });

  it("Rule 3 fallback: halts when AI mode but no theme", async () => {
    const post = makePost({ mode: "aprovar", captionManual: null, theme: null });
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ isCron: true, taskUid: "uid-abc" } as any);
    vi.mocked(dbModule.getPostByScheduleUid).mockResolvedValue(post);
    vi.mocked(dbModule.updatePost).mockResolvedValue(undefined);
    vi.mocked(dbModule.addLog).mockResolvedValue(undefined as any);
    const res = makeRes();
    await runPostHandler(makeReq(), res);
    expect(generateCaption).not.toHaveBeenCalled();
    expect(dbModule.updatePost).toHaveBeenCalledWith(
      post.id,
      expect.objectContaining({ status: "Fluxo Parado" })
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true, action: "halted-no-theme" });
  });

  it("Rules 1+2: queues for executor when manual caption present", async () => {
    const post = makePost({ mode: "aprovar", captionManual: "Minha legenda manual", theme: "phishing" });
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ isCron: true, taskUid: "uid-abc" } as any);
    vi.mocked(dbModule.getPostByScheduleUid).mockResolvedValue(post);
    vi.mocked(dbModule.updatePost).mockResolvedValue(undefined);
    vi.mocked(dbModule.addLog).mockResolvedValue(undefined as any);
    const res = makeRes();
    await runPostHandler(makeReq(), res);
    expect(generateCaption).not.toHaveBeenCalled();
    expect(dbModule.addLog).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "disparo" })
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true, action: "queued-for-executor" });
  });

  it("self-deletes the cron after firing (one-shot cleanup)", async () => {
    const post = makePost({ mode: "manual", captionManual: "Legenda" });
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ isCron: true, taskUid: "uid-abc" } as any);
    vi.mocked(dbModule.getPostByScheduleUid).mockResolvedValue(post);
    vi.mocked(dbModule.updatePost).mockResolvedValue(undefined);
    vi.mocked(dbModule.addLog).mockResolvedValue(undefined as any);
    const res = makeRes();
    await runPostHandler(makeReq(), res);
    expect(deleteHeartbeatJob).toHaveBeenCalledWith("uid-abc", "");
    expect(dbModule.updatePost).toHaveBeenCalledWith(post.id, { scheduleCronTaskUid: null });
  });
});
