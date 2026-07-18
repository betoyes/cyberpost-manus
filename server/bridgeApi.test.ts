import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("./db", () => ({
  createPost: vi.fn(async () => 42),
  addLog: vi.fn(async () => {}),
  getPost: vi.fn(async () => undefined),
  listLogs: vi.fn(async () => []),
}));

vi.mock("./r2", () => ({
  r2PutImage: vi.fn(async () => "https://pub-test.r2.dev/bridge/art-abc.png"),
}));

import * as db from "./db";
import { r2PutImage } from "./r2";
import { bridgePostHandler, bridgeStatusHandler } from "./bridgeApi";

const TOKEN = "brg_7Kx2mPv7nR4tZ9wLbY3eHfA6dG1sJ5q";
const AUTH = { authorization: `Bearer ${TOKEN}` };

function mockRes() {
  const res: Partial<Response> & { _status: number; _json: any } = {
    _status: 200,
    _json: undefined,
    status(code: number) {
      this._status = code;
      return this as Response;
    },
    json(body: unknown) {
      this._json = body;
      return this as Response;
    },
  };
  return res as Response & { _status: number; _json: any };
}

function postReq(body: unknown, headers: Record<string, string> = AUTH): Request {
  return { headers, body } as unknown as Request;
}

describe("POST /api/bridge/post", () => {
  beforeEach(() => {
    process.env.BRIDGE_API_TOKEN = TOKEN;
    process.env.PUBLIC_BASE_URL = "https://cyberpost.example";
    delete process.env.ALLOWED_IMAGE_HOSTS;
    vi.mocked(db.createPost).mockReset().mockResolvedValue(42 as any);
    vi.mocked(db.addLog).mockReset().mockResolvedValue(undefined as any);
    vi.mocked(r2PutImage)
      .mockReset()
      .mockResolvedValue("https://pub-test.r2.dev/bridge/art-abc.png");
  });

  it("rejects requests without a token", async () => {
    const res = mockRes();
    await bridgePostHandler(postReq({ imageUrl: "https://x/a.png", caption: "oi" }, {}), res);
    expect(res._status).toBe(401);
    expect(db.createPost).not.toHaveBeenCalled();
  });

  it("rejects a wrong token", async () => {
    const res = mockRes();
    await bridgePostHandler(
      postReq({ imageUrl: "https://x/a.png", caption: "oi" }, { authorization: "Bearer nope" }),
      res
    );
    expect(res._status).toBe(401);
  });

  it("rejects a missing/invalid imageUrl", async () => {
    const res = mockRes();
    await bridgePostHandler(postReq({ imageUrl: "not-a-url", caption: "oi" }), res);
    expect(res._status).toBe(400);
    expect(db.createPost).not.toHaveBeenCalled();
  });

  it("rejects a non-http(s) imageUrl scheme", async () => {
    const res = mockRes();
    await bridgePostHandler(
      postReq({ imageUrl: "file:///etc/passwd", caption: "oi" }),
      res
    );
    expect(res._status).toBe(400);
  });

  it("rejects an empty caption", async () => {
    const res = mockRes();
    await bridgePostHandler(postReq({ imageUrl: "https://x/a.png", caption: "   " }), res);
    expect(res._status).toBe(400);
  });

  it("rejects a caption over 2200 chars", async () => {
    const res = mockRes();
    await bridgePostHandler(
      postReq({ imageUrl: "https://x/a.png", caption: "a".repeat(2201) }),
      res
    );
    expect(res._status).toBe(400);
  });

  it("creates a manual, pre-approved, Pendente post from an external URL", async () => {
    const res = mockRes();
    await bridgePostHandler(
      postReq({
        imageUrl: "https://cdn.artista/artes/sunnysystems/thumb.png",
        caption: "Legenda aprovada",
        filename: "sunnysystems-123",
        accountId: 3,
        scheduledAt: 1_800_000_000_000,
      }),
      res
    );

    expect(db.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "sunnysystems-123",
        imageUrl: "https://cdn.artista/artes/sunnysystems/thumb.png",
        captionManual: "Legenda aprovada",
        captionApproved: true,
        mode: "manual",
        status: "Pendente",
        mediaType: "image",
        scheduledAt: 1_800_000_000_000,
        accountId: 3,
      })
    );
    expect(res._status).toBe(200);
    expect(res._json).toMatchObject({ ok: true, postId: 42, status: "Pendente" });
    expect(db.addLog).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 42, kind: "bridge" })
    );
  });

  it("hosts imageBase64 on the Postador's own storage and posts from that URL", async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32),
    ]);
    const res = mockRes();
    await bridgePostHandler(
      postReq({
        imageBase64: png.toString("base64"),
        caption: "Arte real do CybersecCAST",
        filename: "cyberseccast-1",
      }),
      res
    );
    expect(r2PutImage).toHaveBeenCalled();
    expect(db.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://pub-test.r2.dev/bridge/art-abc.png",
        captionManual: "Arte real do CybersecCAST",
        captionApproved: true,
        mode: "manual",
        status: "Pendente",
      })
    );
    expect(res._status).toBe(200);
    expect(res._json).toMatchObject({ ok: true, postId: 42, status: "Pendente" });
  });

  it("rejects imageBase64 that is not a real image", async () => {
    const res = mockRes();
    await bridgePostHandler(
      postReq({
        imageBase64: Buffer.from("hello, definitely not an image").toString("base64"),
        caption: "x",
      }),
      res
    );
    expect(res._status).toBe(400);
    expect(r2PutImage).not.toHaveBeenCalled();
    expect(db.createPost).not.toHaveBeenCalled();
  });

  it("rejects when neither imageBase64 nor imageUrl is provided", async () => {
    const res = mockRes();
    await bridgePostHandler(postReq({ caption: "x" }), res);
    expect(res._status).toBe(400);
    expect(db.createPost).not.toHaveBeenCalled();
  });

  it("publishes a reel from a public videoUrl (mediaType reel, no hosting)", async () => {
    const res = mockRes();
    await bridgePostHandler(
      postReq({
        media: "reel",
        videoUrl: "https://pub-test.r2.dev/reels/x.mp4",
        caption: "Reel do Avatar Studio",
        filename: "luiz-reel",
      }),
      res
    );
    // URL pública → não hospeda de novo
    expect(r2PutImage).not.toHaveBeenCalled();
    expect(db.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://pub-test.r2.dev/reels/x.mp4",
        mediaType: "reel",
        captionManual: "Reel do Avatar Studio",
        status: "Pendente",
      })
    );
    expect(res._status).toBe(200);
  });

  it("hosts videoBase64 (MP4) on R2 and creates a reel post", async () => {
    // HEAD-check de propagação do R2 (waitUrlServable) → stub pra não bater na rede.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as unknown as Response));
    vi.mocked(r2PutImage).mockResolvedValue("https://pub-test.r2.dev/bridge/reel-abc.mp4");
    // MP4 mínimo válido: "ftyp" no offset 4.
    const mp4 = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftypmp42"),
      Buffer.alloc(16),
    ]);
    const res = mockRes();
    await bridgePostHandler(
      postReq({ videoBase64: mp4.toString("base64"), caption: "Reel", filename: "luiz-reel" }),
      res
    );
    expect(r2PutImage).toHaveBeenCalled();
    expect(db.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://pub-test.r2.dev/bridge/reel-abc.mp4",
        mediaType: "reel",
      })
    );
    expect(res._status).toBe(200);
    vi.unstubAllGlobals();
  });

  it("rejects videoBase64 that is not a real MP4/MOV", async () => {
    const res = mockRes();
    await bridgePostHandler(
      postReq({ videoBase64: Buffer.from("not a video at all").toString("base64"), caption: "x" }),
      res
    );
    expect(res._status).toBe(400);
    expect(db.createPost).not.toHaveBeenCalled();
  });

  it("rejects a non-integer accountId", async () => {
    const res = mockRes();
    await bridgePostHandler(
      postReq({ imageUrl: "https://x/a.png", caption: "oi", accountId: 1.5 }),
      res
    );
    expect(res._status).toBe(400);
  });

  it("rejects an off-allowlist host when ALLOWED_IMAGE_HOSTS is set", async () => {
    process.env.ALLOWED_IMAGE_HOSTS = "cdn.artista, assets.example.com";
    const res = mockRes();
    await bridgePostHandler(
      postReq({ imageUrl: "https://attacker.example/x.png", caption: "oi" }),
      res
    );
    expect(res._status).toBe(400);
    expect(db.createPost).not.toHaveBeenCalled();
  });

  it("accepts an on-allowlist host when ALLOWED_IMAGE_HOSTS is set", async () => {
    process.env.ALLOWED_IMAGE_HOSTS = "cdn.artista, assets.example.com";
    const res = mockRes();
    await bridgePostHandler(
      postReq({ imageUrl: "https://cdn.artista/artes/sunny/thumb.png", caption: "oi" }),
      res
    );
    expect(res._status).toBe(200);
    expect(db.createPost).toHaveBeenCalled();
  });
});

describe("GET /api/bridge/status/:id", () => {
  beforeEach(() => {
    process.env.BRIDGE_API_TOKEN = TOKEN;
    vi.mocked(db.getPost).mockReset();
    vi.mocked(db.listLogs).mockReset().mockResolvedValue([] as any);
  });

  function statusReq(id: string, headers: Record<string, string> = AUTH): Request {
    return { headers, params: { id } } as unknown as Request;
  }

  it("rejects requests without a token", async () => {
    const res = mockRes();
    await bridgeStatusHandler(statusReq("42", {}), res);
    expect(res._status).toBe(401);
  });

  it("returns 400 for an invalid id", async () => {
    const res = mockRes();
    await bridgeStatusHandler(statusReq("abc"), res);
    expect(res._status).toBe(400);
  });

  it("returns 404 when the post is missing", async () => {
    vi.mocked(db.getPost).mockResolvedValue(undefined as any);
    const res = mockRes();
    await bridgeStatusHandler(statusReq("42"), res);
    expect(res._status).toBe(404);
  });

  it("returns status + this post's logs only", async () => {
    vi.mocked(db.getPost).mockResolvedValue({
      id: 42,
      filename: "sunnysystems-123",
      status: "Postado",
      permalink: "https://instagram.com/p/xyz",
      instagramId: "media-1",
      note: null,
      scheduledAt: 1_800_000_000_000,
    } as any);
    vi.mocked(db.listLogs).mockResolvedValue([
      { postId: 42, kind: "posted", message: "ok", createdAt: new Date() },
      { postId: 99, kind: "posted", message: "other", createdAt: new Date() },
    ] as any);

    const res = mockRes();
    await bridgeStatusHandler(statusReq("42"), res);

    expect(res._status).toBe(200);
    expect(res._json.post).toMatchObject({ id: 42, status: "Postado" });
    expect(res._json.logs).toHaveLength(1);
    expect(res._json.logs[0]).toMatchObject({ kind: "posted", message: "ok" });
  });
});
