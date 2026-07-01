import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAccessToken = vi.fn();

vi.mock("google-auth-library", () => ({
  JWT: vi.fn().mockImplementation(() => ({
    getAccessToken: mockGetAccessToken,
  })),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { downloadDriveImage } from "./googleDrive";

const SA_JSON = JSON.stringify({
  client_email: "sa@example.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
});

describe("downloadDriveImage", () => {
  beforeEach(() => {
    mockGetAccessToken.mockReset();
    mockFetch.mockReset();
    process.env.GOOGLE_SA_JSON = SA_JSON;
  });

  it("throws when GOOGLE_SA_JSON is not configured", async () => {
    delete process.env.GOOGLE_SA_JSON;

    await expect(
      downloadDriveImage({ filename: "a.jpg", folderId: "f1" })
    ).rejects.toThrow("GOOGLE_SA_JSON is not configured");
  });

  it("returns null when no file matches", async () => {
    mockGetAccessToken.mockResolvedValue({ token: "access-token" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [] }),
    });

    const result = await downloadDriveImage({
      filename: "missing.jpg",
      folderId: "f1",
    });

    expect(result).toBeNull();
  });

  it("downloads the file bytes when a match is found", async () => {
    mockGetAccessToken.mockResolvedValue({ token: "access-token" });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ id: "file-1", mimeType: "image/jpeg" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("bytes").buffer,
      });

    const result = await downloadDriveImage({
      filename: "post.jpg",
      folderId: "f1",
    });

    expect(result?.contentType).toBe("image/jpeg");
    expect(result?.buffer.toString()).toBe("bytes");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws when the Drive files.list call fails", async () => {
    mockGetAccessToken.mockResolvedValue({ token: "access-token" });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => "no access",
    });

    await expect(
      downloadDriveImage({ filename: "a.jpg", folderId: "f1" })
    ).rejects.toThrow("Drive files.list failed");
  });
});
