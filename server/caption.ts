import { invokeLLM } from "./_core/llm";
import * as db from "./db";

const DEFAULT_MODEL = "gpt-5-mini";

/**
 * Generates an Instagram caption for cybersecurity content based on theme/keywords.
 * Returns a caption body plus a block of hashtags, formatted for Instagram.
 */
export async function generateCaption(theme: string): Promise<string> {
  const model = (await db.getSetting("llm_model")) || DEFAULT_MODEL;

  const system = [
    "Você é um especialista em conteúdo de cibersegurança para Instagram (perfil CybersecCAST).",
    "Escreva legendas em português do Brasil, com tom profissional, claro e acessível.",
    "A legenda deve ter de 2 a 4 frases curtas, com 1 dica prática de segurança.",
    "Use no máximo 2 emojis relevantes (ex.: 🔐🛡️) e nunca exagere.",
    "Inclua de 6 a 10 hashtags relevantes ao final, misturando português e inglês.",
  ].join(" ");

  const user = `Tema/palavras-chave da arte: "${theme}". Gere a legenda final pronta para publicar.`;

  const response = await invokeLLM({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "instagram_caption",
        strict: true,
        schema: {
          type: "object",
          properties: {
            caption: { type: "string", description: "Corpo da legenda (sem hashtags)" },
            hashtags: {
              type: "array",
              items: { type: "string" },
              description: "Lista de hashtags sem o caractere #",
            },
          },
          required: ["caption", "hashtags"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("LLM retornou conteúdo vazio");

  let parsed: { caption: string; hashtags: string[] };
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : (raw as any);
  } catch {
    // Fallback: treat raw as plain caption text
    return String(raw).trim();
  }

  const tags = (parsed.hashtags || [])
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean)
    .map((t) => `#${t}`)
    .join(" ");

  return `${parsed.caption.trim()}\n\n${tags}`.trim();
}
