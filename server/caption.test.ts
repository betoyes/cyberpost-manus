import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./llm", () => ({
  chatComplete: vi.fn(),
}));

vi.mock("./db", () => ({
  getSetting: vi.fn(),
}));

import { chatComplete } from "./llm";
import * as db from "./db";
import { generateCaption } from "./caption";

describe("generateCaption", () => {
  beforeEach(() => {
    vi.mocked(chatComplete).mockReset();
    vi.mocked(db.getSetting).mockReset();
  });

  it("builds caption + hashtags from a structured JSON response", async () => {
    vi.mocked(db.getSetting).mockResolvedValue(null);
    vi.mocked(chatComplete).mockResolvedValue(
      JSON.stringify({
        caption: "Use senhas fortes e únicas. 🔐",
        hashtags: ["#ciberseguranca", "infosec"],
      })
    );

    const result = await generateCaption("senhas fortes");

    expect(result).toBe(
      "Use senhas fortes e únicas. 🔐\n\n#ciberseguranca #infosec"
    );
  });

  it("passes the configured llm_model setting through to chatComplete", async () => {
    vi.mocked(db.getSetting).mockResolvedValue("gpt-4.1");
    vi.mocked(chatComplete).mockResolvedValue(
      JSON.stringify({ caption: "x", hashtags: [] })
    );

    await generateCaption("tema");

    expect(chatComplete).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4.1" })
    );
  });

  it("falls back to undefined model when no setting is configured", async () => {
    vi.mocked(db.getSetting).mockResolvedValue(null);
    vi.mocked(chatComplete).mockResolvedValue(
      JSON.stringify({ caption: "x", hashtags: [] })
    );

    await generateCaption("tema");

    expect(chatComplete).toHaveBeenCalledWith(
      expect.objectContaining({ model: undefined })
    );
  });

  it("falls back to plain text when the response is not valid JSON", async () => {
    vi.mocked(db.getSetting).mockResolvedValue(null);
    vi.mocked(chatComplete).mockResolvedValue("  legenda crua sem json  ");

    const result = await generateCaption("tema");

    expect(result).toBe("legenda crua sem json");
  });
});
