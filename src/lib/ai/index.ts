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

/**
 * Hard ceiling on a single provider call. Generation is bounded here so a
 * hung provider request cannot run indefinitely; a timeout surfaces as a
 * safe `PROVIDER_ERROR`. This races the call and bounds the caller's await —
 * the SDK does not support aborting non-streaming requests, so the underlying
 * request may still complete (and bill) after the timeout fires.
 */
export const GENERATION_TIMEOUT_MS = 30_000;

/**
 * Defense-in-depth caps on prompt size. Application callers already bound the
 * content they send; these guards fail fast with a safe error if a future
 * caller ever builds an oversized prompt.
 */
export const MAX_PROMPT_CHARS = 40_000;
export const MAX_SYSTEM_CHARS = 4_000;

export type GenerateTextInput = {
  /** The user-facing request text. */
  prompt: string;
  /** Optional instructions that steer the model's behavior. */
  system?: string;
  /** Override the default model. */
  model?: string;
  /** Upper bound on generated tokens. */
  maxOutputTokens?: number;
  /** Override the default per-call timeout. */
  timeoutMs?: number;
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
 * Races a provider call against a timeout. On timeout the caller receives a
 * safe `PROVIDER_ERROR`. A late rejection from the losing promise is absorbed
 * so it can never surface as an unhandled rejection.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          aiError(
            "PROVIDER_ERROR",
            `The AI provider timed out while ${label}.`
          )
        ),
      timeoutMs
    );
  });

  promise.catch(() => {
    // The request was abandoned (e.g. the timeout won). Absorb any later
    // rejection so the underlying SDK promise cannot be reported unhandled.
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Fails fast with a safe error when a prompt or system instruction exceeds
 * the bounds. Throws an `INVALID_INPUT` `AiError`; callers route it like any
 * other AI failure.
 */
function assertPromptBounds(prompt: string, system?: string): void {
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw aiError("INVALID_INPUT", "The prompt is too long.");
  }
  if (system !== undefined && system.length > MAX_SYSTEM_CHARS) {
    throw aiError("INVALID_INPUT", "The system instruction is too long.");
  }
}

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
    assertPromptBounds(input.prompt, input.system);
    const client = getAiClient();

    const response = await withTimeout(
      client.models.generateContent({
        model: input.model ?? DEFAULT_MODEL,
        contents: input.prompt,
        config: {
          ...(input.system !== undefined && { systemInstruction: input.system }),
          ...(input.maxOutputTokens !== undefined && {
            maxOutputTokens: input.maxOutputTokens,
          }),
        },
      }),
      input.timeoutMs ?? GENERATION_TIMEOUT_MS,
      "text generation"
    );

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
    assertPromptBounds(input.prompt, input.system);
    const client = getAiClient();

    const response = await withTimeout(
      client.models.generateContent({
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
      }),
      input.timeoutMs ?? GENERATION_TIMEOUT_MS,
      "JSON generation"
    );

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

/**
 * A web result surfaced by Google Search grounding. Only title and URL are
 * available through the grounding metadata — no snippet or body text.
 */
export type GroundedWebResult = {
  title: string;
  url: string;
};

/**
 * Runs a web search through the Gemini provider's Google Search grounding
 * tool and returns the grounded result references (title + URL only).
 *
 * This is the only place the search capability touches the provider. It is
 * server-only (same client and key as generation), and the URLs come from the
 * provider's grounding metadata — never from the model inventing links.
 * Empty results are a valid outcome and return an empty array.
 */
export async function searchWebWithGrounding(
  query: string
): Promise<GroundedWebResult[]> {
  try {
    const client = getAiClient();

    const response = await withTimeout(
      client.models.generateContent({
        model: DEFAULT_MODEL,
        contents: query,
        config: {
          tools: [{ googleSearch: {} }],
        },
      }),
      GENERATION_TIMEOUT_MS,
      "web search"
    );

    const chunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const results: GroundedWebResult[] = [];
    for (const chunk of chunks) {
      const web = chunk.web;
      if (!web?.uri) continue;
      results.push({ title: web.title?.trim() || web.uri, url: web.uri });
    }
    return results;
  } catch (error) {
    throw toAiError(error);
  }
}
