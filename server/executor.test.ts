import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getPost: vi.fn(),
  updatePost: vi.fn(),
  addLog: vi.fn(),
  resolvePostAccount: vi.fn(),
  getSetting: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(),
}));

vi.mock("./schedulePost", () => ({
  triggerAiApprovalFlow: vi.fn(),
}));

vi.mock("./googleDrive", () => ({
  downloadDriveImage: vi.fn(),
}));

vi.mock("./instagramGraph", () => ({
  publishImageToInstagram: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

import * as db from "./db";
import { notifyOwner } from "./_core/notification";
import { triggerAiApprovalFlow } from "./schedulePost";
import { downloadDriveImage } from "./googleDrive";
import { publishImageToInstagram } from "./instagramGraph";
import { storagePut } from "./storage";
import { runExecutionForPost } from "./executor";

const basePost = {
  id: 1,
  filename: "post.jpg",
  theme: "senhas fortes",
  mode: "manual" as const,
  status: "Pendente" as const,
  scheduledAt: Date.now() - 1000,
  mediaType: "image" as const,
  captionManual: "Legenda manual pronta",
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
  scheduleCronTaskUid: null,
  note: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("runExecutionForPost", () => {
  beforeEach(() => {
    vi.mocked(db.getPost).mockReset();
    vi.mocked(db.updatePost)
      .mockReset()
      .mockResolvedValue(undefined as any);
    vi.mocked(db.addLog)
      .mockReset()
      .mockResolvedValue(undefined as any);
    vi.mocked(db.resolvePostAccount).mockReset();
    vi.mocked(db.getSetting).mockReset();
    vi.mocked(notifyOwner).mockReset().mockResolvedValue(true);
    vi.mocked(triggerAiApprovalFlow).mockReset();
    vi.mocked(downloadDriveImage).mockReset();
    vi.mocked(publishImageToInstagram).mockReset();
    vi.mocked(storagePut).mockReset();
    process.env.DRIVE_FOLDER_ID = "folder-1";
    process.env.PUBLIC_BASE_URL = "https://app.example.com";
  });

  it("does nothing when the post no longer exists", async () => {
    vi.mocked(db.getPost).mockResolvedValue(undefined as any);
    await runExecutionForPost(999);
    expect(db.updatePost).not.toHaveBeenCalled();
  });

  it("leaves the post untouched when resolveCaption halts", async () => {
    vi.mocked(db.getPost).mockResolvedValue({
      ...basePost,
      captionManual: "",
      mode: "manual",
      captionAi: null,
    } as any);

    await runExecutionForPost(1);

    expect(db.updatePost).not.toHaveBeenCalled();
    expect(triggerAiApprovalFlow).not.toHaveBeenCalled();
  });

  it("triggers the AI approval flow for AI mode without a manual caption", async () => {
    vi.mocked(db.getPost).mockResolvedValue({
      ...basePost,
      mode: "aprovar",
      captionManual: "",
      captionAi: null,
      theme: "senhas fortes",
    } as any);
    vi.mocked(triggerAiApprovalFlow).mockResolvedValue({
      action: "awaiting-approval",
    });

    await runExecutionForPost(1);

    expect(triggerAiApprovalFlow).toHaveBeenCalledTimes(1);
    expect(downloadDriveImage).not.toHaveBeenCalled();
  });

  it("stops with Fluxo Parado when no Instagram account is configured", async () => {
    vi.mocked(db.getPost).mockResolvedValue({ ...basePost } as any);
    vi.mocked(db.resolvePostAccount).mockResolvedValue(null);

    await runExecutionForPost(1);

    expect(db.updatePost).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: "Fluxo Parado" })
    );
    expect(downloadDriveImage).not.toHaveBeenCalled();
  });

  it("stops with Fluxo Parado when no Meta token is saved", async () => {
    vi.mocked(db.getPost).mockResolvedValue({ ...basePost } as any);
    vi.mocked(db.resolvePostAccount).mockResolvedValue({
      id: 1,
      name: "Conta",
      handle: null,
      igUserId: "ig-1",
    });
    vi.mocked(db.getSetting).mockResolvedValue(null);

    await runExecutionForPost(1);

    expect(db.updatePost).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: "Fluxo Parado" })
    );
    expect(downloadDriveImage).not.toHaveBeenCalled();
  });

  it("marks Erro: Imagem Ausente when the Drive file is not found", async () => {
    vi.mocked(db.getPost).mockResolvedValue({ ...basePost } as any);
    vi.mocked(db.resolvePostAccount).mockResolvedValue({
      id: 1,
      name: "Conta",
      handle: null,
      igUserId: "ig-1",
    });
    vi.mocked(db.getSetting).mockResolvedValue("meta-token");
    vi.mocked(downloadDriveImage).mockResolvedValue(null);

    await runExecutionForPost(1);

    expect(db.updatePost).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: "Erro: Imagem Ausente" })
    );
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("publishes successfully and marks the post Postado", async () => {
    vi.mocked(db.getPost).mockResolvedValue({ ...basePost } as any);
    vi.mocked(db.resolvePostAccount).mockResolvedValue({
      id: 1,
      name: "Conta",
      handle: null,
      igUserId: "ig-1",
    });
    vi.mocked(downloadDriveImage).mockResolvedValue({
      buffer: Buffer.from("bytes"),
      contentType: "image/jpeg",
    });
    vi.mocked(db.getSetting).mockResolvedValue("meta-token");
    vi.mocked(storagePut).mockResolvedValue({
      key: "posts/post.jpg",
      url: "/manus-storage/posts/post.jpg",
    });
    vi.mocked(publishImageToInstagram).mockResolvedValue({
      mediaId: "media-1",
      permalink: "https://instagram.com/p/xyz",
    });

    await runExecutionForPost(1);

    expect(publishImageToInstagram).toHaveBeenCalledWith(
      expect.objectContaining({
        igUserId: "ig-1",
        imageUrl: "https://app.example.com/manus-storage/posts/post.jpg",
        caption: "Legenda manual pronta",
        accessToken: "meta-token",
      })
    );
    expect(db.updatePost).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: "Postado",
        instagramId: "media-1",
        permalink: "https://instagram.com/p/xyz",
      })
    );
  });

  it("marks Fluxo Parado when publishing throws", async () => {
    vi.mocked(db.getPost).mockResolvedValue({ ...basePost } as any);
    vi.mocked(db.resolvePostAccount).mockResolvedValue({
      id: 1,
      name: "Conta",
      handle: null,
      igUserId: "ig-1",
    });
    vi.mocked(downloadDriveImage).mockResolvedValue({
      buffer: Buffer.from("bytes"),
      contentType: "image/jpeg",
    });
    vi.mocked(db.getSetting).mockResolvedValue("meta-token");
    vi.mocked(storagePut).mockResolvedValue({
      key: "posts/post.jpg",
      url: "/manus-storage/posts/post.jpg",
    });
    vi.mocked(publishImageToInstagram).mockRejectedValue(
      new Error("Instagram Graph API error (400): boom")
    );

    await runExecutionForPost(1);

    expect(db.updatePost).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: "Fluxo Parado" })
    );
    expect(notifyOwner).toHaveBeenCalled();
  });
});
