import { describe, expect, it } from "vitest";
import {
  resolveCaption,
  shouldSendMissingAlert,
  MISSING_ALERT_INTERVAL_MS,
  interpretApprovalReply,
} from "./engine";
import type { Post } from "../drizzle/schema";

function makePost(overrides: Partial<Post>): Post {
  const now = new Date();
  return {
    id: 1,
    filename: "art.png",
    theme: "phishing",
    mode: "aprovar",
    status: "Pendente",
    scheduledAt: now.getTime(),
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
    note: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Post;
}

describe("resolveCaption — strict priority", () => {
  it("manual caption always wins, even when AI caption is approved", () => {
    const post = makePost({
      captionManual: "Minha legenda manual",
      captionAi: "Legenda da IA",
      captionApproved: true,
    });
    const r = resolveCaption(post);
    expect(r.kind).toBe("manual");
    if (r.kind === "manual") expect(r.caption).toBe("Minha legenda manual");
  });

  it("uses AI caption only when it exists AND is approved", () => {
    const post = makePost({ captionManual: null, captionAi: "Legenda IA", captionApproved: true });
    const r = resolveCaption(post);
    expect(r.kind).toBe("ai-approved");
  });

  it("halts when AI caption exists but is NOT approved", () => {
    const post = makePost({ captionManual: null, captionAi: "Legenda IA", captionApproved: false });
    const r = resolveCaption(post);
    expect(r.kind).toBe("halt");
  });

  it("halts when neither manual nor approved AI caption exists", () => {
    const post = makePost({ captionManual: null, captionAi: null, captionApproved: false });
    const r = resolveCaption(post);
    expect(r.kind).toBe("halt");
  });

  it("treats whitespace-only manual caption as empty (falls through to halt)", () => {
    const post = makePost({ captionManual: "   ", captionAi: null });
    const r = resolveCaption(post);
    expect(r.kind).toBe("halt");
  });
});

describe("interpretApprovalReply — case-insensitive exact keywords", () => {
  it("approves on aprovado/sim/yes (any case)", () => {
    expect(interpretApprovalReply("Aprovado!")).toBe("approve");
    expect(interpretApprovalReply("sim, pode postar")).toBe("approve");
    expect(interpretApprovalReply("YES")).toBe("approve");
  });
  it("rejects on reprovado/não/no (any case)", () => {
    expect(interpretApprovalReply("Reprovado")).toBe("reject");
    expect(interpretApprovalReply("Não")).toBe("reject");
    expect(interpretApprovalReply("nao")).toBe("reject");
    expect(interpretApprovalReply("NO")).toBe("reject");
  });
  it("returns null when no recognized keyword is present", () => {
    expect(interpretApprovalReply("talvez depois eu veja")).toBeNull();
    expect(interpretApprovalReply("")).toBeNull();
  });
});

describe("shouldSendMissingAlert — 6h cadence", () => {
  const now = 1_000_000_000_000;
  it("sends when no alert was ever sent", () => {
    expect(shouldSendMissingAlert(null, now)).toBe(true);
  });
  it("does not send before 6h elapsed", () => {
    expect(shouldSendMissingAlert(now - (MISSING_ALERT_INTERVAL_MS - 1000), now)).toBe(false);
  });
  it("sends once 6h elapsed", () => {
    expect(shouldSendMissingAlert(now - MISSING_ALERT_INTERVAL_MS, now)).toBe(true);
  });
});
