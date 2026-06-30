import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Post } from "../drizzle/schema";

vi.mock("./db", () => ({
  getPost: vi.fn(),
  updatePost: vi.fn(),
  addLog: vi.fn(),
}));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(),
}));

import { approvalGetHandler } from "./approvalHandler";
import * as dbModule from "./db";

const VALID_TOKEN = "a".repeat(64);

function makePost(overrides: Partial<Post> = {}): Post {
  const now = new Date();
  return {
    id: 1,
    filename: "art.png",
    theme: "phishing",
    mode: "aprovar",
    status: "Aguardando Aprovação",
    scheduledAt: null,
    mediaType: "image",
    captionManual: null,
    captionAi: "Legenda de IA gerada",
    captionApproved: false,
    imageStorageKey: null,
    imageUrl: null,
    instagramId: null,
    permalink: null,
    driveFileId: null,
    approvalToken: VALID_TOKEN,
    approvalEmailSentAt: Date.now(),
    lastMissingAlertAt: null,
    accountId: null,
    scheduleCronTaskUid: null,
    note: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Post;
}

function makeReq(postId: string | number, token: string, decision: string) {
  return {
    params: { postId: String(postId), token },
    query: { decision },
  } as any;
}

function makeRes() {
  const res: any = {};
  res.redirect = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbModule.updatePost).mockResolvedValue(undefined);
  vi.mocked(dbModule.addLog).mockResolvedValue(undefined as any);
});

describe("approvalGetHandler", () => {
  it("approves with valid token → captionApproved=true, status=Pendente, token cleared", async () => {
    vi.mocked(dbModule.getPost).mockResolvedValue(makePost());
    const res = makeRes();
    await approvalGetHandler(makeReq(1, VALID_TOKEN, "approve"), res);
    expect(dbModule.updatePost).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ captionApproved: true, status: "Pendente", approvalToken: null })
    );
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining("/aprovacao?status=approved"));
  });

  it("rejects with valid token → status=Fluxo Parado, token cleared", async () => {
    vi.mocked(dbModule.getPost).mockResolvedValue(makePost());
    const res = makeRes();
    await approvalGetHandler(makeReq(1, VALID_TOKEN, "reject"), res);
    expect(dbModule.updatePost).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ captionApproved: false, status: "Fluxo Parado", approvalToken: null })
    );
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining("/aprovacao?status=rejected"));
  });

  it("wrong token → no state change, redirect invalid-token", async () => {
    vi.mocked(dbModule.getPost).mockResolvedValue(makePost({ approvalToken: "other-token" }));
    const res = makeRes();
    await approvalGetHandler(makeReq(1, VALID_TOKEN, "approve"), res);
    expect(dbModule.updatePost).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith("/aprovacao?status=error&reason=invalid-token");
  });

  it("already used token (null) → no state change, redirect invalid-token", async () => {
    vi.mocked(dbModule.getPost).mockResolvedValue(makePost({ approvalToken: null }));
    const res = makeRes();
    await approvalGetHandler(makeReq(1, VALID_TOKEN, "approve"), res);
    expect(dbModule.updatePost).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith("/aprovacao?status=error&reason=invalid-token");
  });

  it("post not in Aguardando Aprovação → no state change, redirect invalid-token", async () => {
    vi.mocked(dbModule.getPost).mockResolvedValue(makePost({ status: "Pendente" }));
    const res = makeRes();
    await approvalGetHandler(makeReq(1, VALID_TOKEN, "approve"), res);
    expect(dbModule.updatePost).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith("/aprovacao?status=error&reason=invalid-token");
  });

  it("invalid decision → no state change, redirect invalid-request", async () => {
    vi.mocked(dbModule.getPost).mockResolvedValue(makePost());
    const res = makeRes();
    await approvalGetHandler(makeReq(1, VALID_TOKEN, "delete"), res);
    expect(dbModule.updatePost).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith("/aprovacao?status=error&reason=invalid-request");
  });

  it("idempotency: second click after token cleared → error, no second update", async () => {
    vi.mocked(dbModule.getPost).mockResolvedValueOnce(makePost());
    const res1 = makeRes();
    await approvalGetHandler(makeReq(1, VALID_TOKEN, "approve"), res1);
    expect(res1.redirect).toHaveBeenCalledWith(expect.stringContaining("approved"));

    // Token is now null — second click fails
    vi.mocked(dbModule.getPost).mockResolvedValueOnce(makePost({ approvalToken: null, status: "Pendente" }));
    const res2 = makeRes();
    await approvalGetHandler(makeReq(1, VALID_TOKEN, "approve"), res2);
    expect(res2.redirect).toHaveBeenCalledWith("/aprovacao?status=error&reason=invalid-token");
    expect(dbModule.updatePost).toHaveBeenCalledTimes(1); // only once total
  });
});
