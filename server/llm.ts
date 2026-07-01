import OpenAI from "openai";
import { ENV } from "./_core/env";

export type JsonSchemaSpec = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type ChatCompleteParams = {
  system: string;
  user: string;
  model?: string;
  jsonSchema?: JsonSchemaSpec;
};

let cachedClient: OpenAI | null = null;

const getClient = (): OpenAI => {
  if (!ENV.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: ENV.openaiApiKey });
  }
  return cachedClient;
};

/**
 * Own LLM provider (OpenAI). Replaces the Manus Forge invokeLLM dependency —
 * see HANDOFF_INDEPENDENCIA_MANUS.md §4.
 */
export async function chatComplete(
  params: ChatCompleteParams
): Promise<string> {
  const { system, user, model, jsonSchema } = params;
  const client = getClient();

  const response = await client.chat.completions.create({
    model: model || ENV.llmModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(jsonSchema
      ? {
          response_format: {
            type: "json_schema" as const,
            json_schema: {
              name: jsonSchema.name,
              schema: jsonSchema.schema,
              strict: jsonSchema.strict ?? true,
            },
          },
        }
      : {}),
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM retornou conteúdo vazio");
  return content;
}
