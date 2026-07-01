import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

import { chatComplete } from "./llm";

describe("chatComplete", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.LLM_MODEL;
  });

  it("throws when OPENAI_API_KEY is not configured", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(chatComplete({ system: "s", user: "u" })).rejects.toThrow(
      "OPENAI_API_KEY is not configured"
    );
  });

  it("sends system+user messages and returns the message content", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "hello world" } }],
    });

    const result = await chatComplete({ system: "sys", user: "usr" });

    expect(result).toBe("hello world");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "usr" },
        ],
      })
    );
  });

  it("uses the explicit model over the default", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    });

    await chatComplete({ system: "s", user: "u", model: "gpt-4.1" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4.1" })
    );
  });

  it("passes a strict json_schema response_format when jsonSchema is provided", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "{}" } }],
    });

    await chatComplete({
      system: "s",
      user: "u",
      jsonSchema: { name: "thing", schema: { type: "object" } },
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "thing",
            schema: { type: "object" },
            strict: true,
          },
        },
      })
    );
  });

  it("throws when the LLM returns empty content", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: "" } }] });

    await expect(chatComplete({ system: "s", user: "u" })).rejects.toThrow(
      "LLM retornou conteúdo vazio"
    );
  });
});
