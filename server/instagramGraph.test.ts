import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { publishImageToInstagram } from "./instagramGraph";

describe("publishImageToInstagram", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("creates, publishes, and fetches the permalink on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "creation-1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "media-1" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ permalink: "https://instagram.com/p/xyz" }),
      });

    const result = await publishImageToInstagram({
      igUserId: "ig-1",
      imageUrl: "https://example.com/img.jpg",
      caption: "hello",
      accessToken: "token",
    });

    expect(result).toEqual({
      mediaId: "media-1",
      permalink: "https://instagram.com/p/xyz",
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws when media creation fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: { message: "invalid image_url" } }),
    });

    await expect(
      publishImageToInstagram({
        igUserId: "ig-1",
        imageUrl: "not-a-url",
        caption: "hello",
        accessToken: "token",
      })
    ).rejects.toThrow("invalid image_url");
  });

  it("throws when media_publish fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "creation-1" }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Server Error",
        json: async () => ({ error: { message: "publish failed" } }),
      });

    await expect(
      publishImageToInstagram({
        igUserId: "ig-1",
        imageUrl: "https://example.com/img.jpg",
        caption: "hello",
        accessToken: "token",
      })
    ).rejects.toThrow("publish failed");
  });

  it("still returns the mediaId when the permalink fetch fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "creation-1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "media-1" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: "err", json: async () => ({}) });

    const result = await publishImageToInstagram({
      igUserId: "ig-1",
      imageUrl: "https://example.com/img.jpg",
      caption: "hello",
      accessToken: "token",
    });

    expect(result).toEqual({ mediaId: "media-1", permalink: null });
  });
});
