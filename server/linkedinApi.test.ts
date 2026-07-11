import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  publishImageToLinkedIn,
  publishTextToLinkedIn,
  escapeCommentary,
  toOrganizationUrn,
} from "./linkedinApi";

const ORG_ID = "5583111";
const ORG_URN = "urn:li:organization:5583111";
const IMAGE_URN = "urn:li:image:C4E10AQFoyyAjHPMQuQ";
const UPLOAD_URL = "https://www.linkedin.com/dms-uploads/abc/uploaded-image/0";
const POST_URN = "urn:li:share:6844785523593134080";
const IMAGE_URL = "https://cdn.example.com/art.png";
const TOKEN = "test-token";

/**
 * Encena a sequência de 4 fetches do publisher, na ordem: (1) baixar a arte,
 * (2) initializeUpload, (3) PUT dos bytes, (4) criar o post. Cada chamada devolve
 * a resposta encenada e a gente guarda os argumentos pra checar depois.
 */
function stubFetchSequence() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const target = String(url);

      // (1) baixar a imagem da URL pública
      if (target === IMAGE_URL) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
        } as unknown as Response);
      }
      // (2) initializeUpload
      if (target.endsWith("/rest/images?action=initializeUpload")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ value: { uploadUrl: UPLOAD_URL, image: IMAGE_URN } }),
        } as unknown as Response);
      }
      // (3) upload dos bytes
      if (target === UPLOAD_URL) {
        return Promise.resolve({ ok: true } as unknown as Response);
      }
      // (4) criar o post — URN volta no header x-restli-id
      if (target.endsWith("/rest/posts")) {
        return Promise.resolve({
          ok: true,
          headers: { get: (h: string) => (h === "x-restli-id" ? POST_URN : null) },
        } as unknown as Response);
      }
      throw new Error(`fetch inesperado: ${target}`);
    });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("escapeCommentary", () => {
  it("escapa os caracteres reservados do formato little", () => {
    expect(escapeCommentary("a (b) [c] @d #e")).toBe(
      "a \\(b\\) \\[c\\] \\@d \\#e"
    );
  });

  it("deixa texto comum intacto", () => {
    expect(escapeCommentary("Olá mundo, tudo bem!")).toBe("Olá mundo, tudo bem!");
  });
});

describe("toOrganizationUrn", () => {
  it("monta a URN a partir do id numérico", () => {
    expect(toOrganizationUrn("123")).toBe("urn:li:organization:123");
  });

  it("mantém uma URN já formada", () => {
    expect(toOrganizationUrn("urn:li:organization:123")).toBe(
      "urn:li:organization:123"
    );
  });
});

describe("publishImageToLinkedIn", () => {
  beforeEach(() => stubFetchSequence());
  afterEach(() => vi.unstubAllGlobals());

  it("sobe a imagem e cria o post, devolvendo URN + permalink", async () => {
    const result = await publishImageToLinkedIn({
      orgId: ORG_ID,
      imageUrl: IMAGE_URL,
      caption: "legenda de teste",
      accessToken: TOKEN,
    });

    expect(result.postUrn).toBe(POST_URN);
    expect(result.permalink).toBe(
      `https://www.linkedin.com/feed/update/${POST_URN}/`
    );
  });

  it("initializeUpload manda o owner como URN da organização", async () => {
    const { calls } = stubFetchSequence();
    await publishImageToLinkedIn({
      orgId: ORG_ID,
      imageUrl: IMAGE_URL,
      caption: "x",
      accessToken: TOKEN,
    });
    const initCall = calls.find((c) =>
      c.url.endsWith("/rest/images?action=initializeUpload")
    );
    expect(initCall).toBeDefined();
    const body = JSON.parse(initCall!.init!.body as string);
    expect(body).toEqual({ initializeUploadRequest: { owner: ORG_URN } });
    const headers = initCall!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
    expect(headers["LinkedIn-Version"]).toMatch(/^\d{6}$/);
  });

  it("cria o post com author, commentary escapada e a URN da imagem", async () => {
    const { calls } = stubFetchSequence();
    await publishImageToLinkedIn({
      orgId: ORG_ID,
      imageUrl: IMAGE_URL,
      caption: "veja (isso)",
      accessToken: TOKEN,
    });
    const postCall = calls.find((c) => c.url.endsWith("/rest/posts"));
    expect(postCall).toBeDefined();
    expect(postCall!.init!.method).toBe("POST");
    const body = JSON.parse(postCall!.init!.body as string);
    expect(body.author).toBe(ORG_URN);
    expect(body.commentary).toBe("veja \\(isso\\)");
    expect(body.content.media.id).toBe(IMAGE_URN);
    expect(body.lifecycleState).toBe("PUBLISHED");
    expect(body.visibility).toBe("PUBLIC");
  });

  it("sobe os bytes via PUT na uploadUrl", async () => {
    const { calls } = stubFetchSequence();
    await publishImageToLinkedIn({
      orgId: ORG_ID,
      imageUrl: IMAGE_URL,
      caption: "x",
      accessToken: TOKEN,
    });
    const uploadCall = calls.find((c) => c.url === UPLOAD_URL);
    expect(uploadCall).toBeDefined();
    expect(uploadCall!.init!.method).toBe("PUT");
  });

  it("lança erro enxuto quando a criação do post falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL) => {
        const target = String(url);
        if (target === IMAGE_URL)
          return Promise.resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
          } as unknown as Response);
        if (target.endsWith("/rest/images?action=initializeUpload"))
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({ value: { uploadUrl: UPLOAD_URL, image: IMAGE_URN } }),
          } as unknown as Response);
        if (target === UPLOAD_URL)
          return Promise.resolve({ ok: true } as unknown as Response);
        return Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          json: () => Promise.resolve({ message: "ACCESS_DENIED" }),
        } as unknown as Response);
      })
    );

    await expect(
      publishImageToLinkedIn({
        orgId: ORG_ID,
        imageUrl: IMAGE_URL,
        caption: "x",
        accessToken: TOKEN,
      })
    ).rejects.toThrow(/LinkedIn API error \(403\): ACCESS_DENIED/);
  });
});

/** Encena só o POST /rest/posts (texto puro não baixa nem sobe imagem). */
function stubTextPostFetch(postUrn: string = POST_URN) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/rest/posts")) {
        return Promise.resolve({
          ok: true,
          headers: { get: (h: string) => (h === "x-restli-id" ? postUrn : null) },
        } as unknown as Response);
      }
      throw new Error(`fetch inesperado: ${String(url)}`);
    });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("publishTextToLinkedIn", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("cria um post de texto puro num único POST /rest/posts (sem upload)", async () => {
    const { calls, fetchMock } = stubTextPostFetch();
    const result = await publishTextToLinkedIn({
      orgId: ORG_ID,
      caption: "gancho forte na primeira linha",
      accessToken: TOKEN,
    });

    expect(result.postUrn).toBe(POST_URN);
    expect(result.permalink).toBe(
      `https://www.linkedin.com/feed/update/${POST_URN}/`
    );
    // Um único fetch: nada de baixar/subir imagem.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toMatch(/\/rest\/posts$/);
  });

  it("manda author, commentary escapada, PUBLIC e SEM content (texto puro)", async () => {
    const { calls } = stubTextPostFetch();
    await publishTextToLinkedIn({
      orgId: ORG_ID,
      caption: "veja (isso)",
      accessToken: TOKEN,
    });
    const body = JSON.parse(calls[0].init!.body as string);
    expect(body.author).toBe(ORG_URN);
    expect(body.commentary).toBe("veja \\(isso\\)");
    expect(body.visibility).toBe("PUBLIC");
    expect(body.lifecycleState).toBe("PUBLISHED");
    // Texto puro NÃO carrega mídia.
    expect(body.content).toBeUndefined();
  });

  it("lança erro enxuto quando a criação do post falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: () => Promise.resolve({ message: "INVALID_COMMENTARY" }),
      } as unknown as Response)
    );
    await expect(
      publishTextToLinkedIn({ orgId: ORG_ID, caption: "x", accessToken: TOKEN })
    ).rejects.toThrow(/LinkedIn API error \(422\): INVALID_COMMENTARY/);
  });
});
