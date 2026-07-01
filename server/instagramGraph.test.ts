import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  publishImageToInstagram,
  testInstagramConnection,
} from "./instagramGraph";

describe("publishImageToInstagram", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("creates, publishes, and fetches the permalink on success", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "creation-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "media-1" }),
      })
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
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "creation-1" }),
      })
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
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "creation-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "media-1" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "err",
        json: async () => ({}),
      });

    const result = await publishImageToInstagram({
      igUserId: "ig-1",
      imageUrl: "https://example.com/img.jpg",
      caption: "hello",
      accessToken: "token",
    });

    expect(result).toEqual({ mediaId: "media-1", permalink: null });
  });
});

describe("testInstagramConnection", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns ok + username on success, using a read-only GET (no publish calls)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ig-1", username: "cyberseccast" }),
    });

    const result = await testInstagramConnection({
      igUserId: "ig-1",
      accessToken: "token",
    });

    expect(result).toEqual({ ok: true, username: "cyberseccast" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).not.toContain("/media");
  });

  it("returns a short sanitized message on Graph API error, without the full payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({
        error: {
          message: "Invalid OAuth access token.",
          type: "OAuthException",
          code: 190,
        },
      }),
    });

    const result = await testInstagramConnection({
      igUserId: "ig-1",
      accessToken: "expired-token",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("Invalid OAuth access token.");
      expect(result.message).not.toContain("expired-token");
    }
  });

  it("returns a fixed generic message when fetch itself throws (network error) — never echoes error.message, which could embed the token-bearing URL", async () => {
    mockFetch.mockRejectedValueOnce(
      new Error(
        "fetch failed: https://graph.facebook.com/v21.0/ig-1?access_token=super-secret"
      )
    );

    const result = await testInstagramConnection({
      igUserId: "ig-1",
      accessToken: "super-secret",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("super-secret");
      expect(result.message).not.toContain("access_token");
    }
  });
});
