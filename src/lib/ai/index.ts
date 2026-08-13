import "server-only";

import { getAiClient } from "./client";
import { aiError, toAiError } from "./errors";

export {
  aiError,
  isAiError,
  toAiError,
  type AiError,
  type AiErrorCode,
} from "./errors";

/**
 * Default model used when callers do not ask for a specific one. A cheap,
 * fast Flash-tier model keeps default calls inexpensive.
 *
 * `gemini-2.5-flash` was retired for new API keys; `gemini-3.5-flash` is its
 * GA replacement (see https://ai.google.dev/gemini-api/docs/deprecations).
 */
export const DEFAULT_MODEL = "gemini-3.5-flash";

export type GenerateTextInput = {
  /** The user-facing request text. */
  prompt: string;
  /** Optional instructions that steer the model's behavior. */
  system?: string;
  /** Override the default model. */
  model?: string;
  /** Upper bound on generated tokens. */
  maxOutputTokens?: number;
};

export type GenerateJsonInput = Omit<GenerateTextInput, "prompt"> & {
  /** The user-facing request text. */
  prompt: string;
  /**
   * JSON Schema that the provider must make the response conform to. Passed
   * through to the Gemini `responseJsonSchema` option; the provider enforces
   * the shape during generation.
   */
  schema?: Record<string, unknown>;
};

/**
 * Generates text through the configured AI provider.
 *
 * This is the only entry point the rest of the application should import; it
 * hides the provider SDK so switching providers later does not change callers.
 */
export async function generateText(
  input: GenerateTextInput
): Promise<string> {
  try {
    const client = getAiClient();

    const response = await client.models.generateContent({
      model: input.model ?? DEFAULT_MODEL,
      contents: input.prompt,
      config: {
        ...(input.system !== undefined && { systemInstruction: input.system }),
        ...(input.maxOutputTokens !== undefined && {
          maxOutputTokens: input.maxOutputTokens,
        }),
      },
    });

    const text = response.text ?? "";
    if (text.trim().length === 0) {
      throw aiError(
        "PROVIDER_ERROR",
        "The AI provider returned an empty response."
      );
    }

    return text;
  } catch (error) {
    throw toAiError(error);
  }
}

/**
 * Generates JSON through the configured AI provider.
 *
 * Unlike `generateText`, the provider is asked to produce a JSON object that
 * conforms to `input.schema`. The raw response text is parsed here so callers
 * receive an already-validated value; a response that is not valid JSON
 * becomes an `INVALID_RESPONSE` error rather than leaking raw provider text.
 */
export async function generateJson(input: GenerateJsonInput): Promise<unknown> {
  try {
    const client = getAiClient();

    const response = await client.models.generateContent({
      model: input.model ?? DEFAULT_MODEL,
      contents: input.prompt,
      config: {
        ...(input.system !== undefined && { systemInstruction: input.system }),
        ...(input.maxOutputTokens !== undefined && {
          maxOutputTokens: input.maxOutputTokens,
        }),
        responseMimeType: "application/json",
        ...(input.schema !== undefined && {
          responseJsonSchema: input.schema,
        }),
      },
    });

    const text = response.text ?? "";
    if (text.trim().length === 0) {
      throw aiError(
        "PROVIDER_ERROR",
        "The AI provider returned an empty response."
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw aiError(
        "INVALID_RESPONSE",
        "The AI provider returned malformed JSON."
      );
    }
  } catch (error) {
    throw toAiError(error);
  }
}
