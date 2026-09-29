import "server-only";

import { aiError, isAiError, type AiError } from "@/lib/ai";
import type { AnswerGenerationInput, AnswerGenerationProvider } from "./types";

/**
 * Environment variables backing the Groq fallback provider. Read on the
 * server only; never logged, never exposed to the client.
 */
const GROQ_API_KEY_ENV = "GROQ_API_KEY";
const GROQ_MODEL_ENV = "GROQ_MODEL";

/**
 * Default model used when `GROQ_MODEL` is not set. Cheap, fast, free-tier
 * Groq model; the documented replacement for the deprecated
 * `llama-3.3-70b-versatile`.
 */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

const GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Hard ceiling on a single Groq call. Matches the app's bounded generation
 * budget; a hung provider request cannot run indefinitely.
 */
export const GROQ_TIMEOUT_MS = 30_000;

/**
 * Whether the Groq API key is present in the environment. Used to log
 * configuration presence without ever logging the key itself.
 */
export function isGroqConfigured(): boolean {
  return Boolean(process.env[GROQ_API_KEY_ENV]);
}

type GroqMessage = { role: "system" | "user"; content: string };

type GroqChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

/**
 * Removes any occurrence of the API key from a value so it can never leak
 * into logs or an error message, even if the provider echoes it back.
 */
function redact(value: string, apiKey: string): string {
  return value.split(apiKey).join("[redacted]");
}

/**
 * Pulls a safe message out of a Groq error body (their `error.message`
 * field), redacting the API key, or falls back to a status-based message.
 */
function extractErrorMessage(
  body: unknown,
  status: number,
  apiKey: string,
): string {
  if (typeof body === "object" && body !== null) {
    const candidate =
      (body as { error?: { message?: unknown } }).error?.message ??
      (body as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return redact(candidate.trim(), apiKey);
    }
  }
  return `The AI provider could not complete the request (HTTP ${status}).`;
}

async function requestGroq(
  apiKey: string,
  model: string,
  messages: GroqMessage[],
  maxOutputTokens: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxOutputTokens,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Non-JSON error body — fall through to the status-based message.
    }

    if (!response.ok) {
      throw {
        code: "PROVIDER_ERROR",
        message: extractErrorMessage(body, response.status, apiKey),
        status: response.status,
      };
    }

    const choices = (body as GroqChatResponse | null)?.choices ?? [];
    const content = choices[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw aiError(
        "PROVIDER_ERROR",
        "The AI provider returned an empty response.",
      );
    }

    try {
      return JSON.parse(content);
    } catch {
      throw aiError(
        "INVALID_RESPONSE",
        "The AI provider returned malformed JSON.",
      );
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Reduces a provider/unknown failure to a safe `AiError`. Logs only the
 * safe, redacted message — never the request, headers, or the API key.
 */
function toProviderError(error: unknown, apiKey: string): AiError {
  if (isAiError(error)) {
    console.error(
      "[research] generation:groq_failure error=",
      redact(error.message, apiKey),
    );
    return error;
  }
  if (error instanceof Error && error.name === "AbortError") {
    console.error(
      "[research] generation:groq_failure error=The AI provider timed out.",
    );
    return aiError("PROVIDER_ERROR", "The AI provider timed out.");
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    "[research] generation:groq_failure error=",
    redact(message, apiKey),
  );
  return aiError(
    "PROVIDER_ERROR",
    "The AI provider could not complete the request.",
  );
}

/**
 * Groq-backed fallback answer-generation provider.
 *
 * Used only when the primary provider fails with a transient condition. Reads
 * `GROQ_API_KEY` and `GROQ_MODEL` from the environment at call time and calls
 * Groq's OpenAI-compatible chat completions endpoint with the exact prompt,
 * system instruction, model, token budget, and JSON response format the
 * generation layer already assembled — never re-running research. The raw
 * response content is parsed to JSON; citation validation and resolution stay
 * in the generation layer, unchanged by which provider ran.
 */
export class GroqAnswerProvider implements AnswerGenerationProvider {
  async generate(input: AnswerGenerationInput): Promise<unknown> {
    const apiKey = process.env[GROQ_API_KEY_ENV];
    const model =
      (process.env[GROQ_MODEL_ENV] ?? "").trim() || DEFAULT_GROQ_MODEL;
    console.log(
      `[research] generation:config groqApiKeyConfigured=${Boolean(apiKey)} model=${model}`,
    );

    if (!apiKey) {
      throw aiError(
        "NOT_CONFIGURED",
        "GROQ_API_KEY is not set. Add it to .env.local to enable the Groq fallback for answer generation.",
      );
    }

    console.log("[research] generation:groq_start");
    try {
      const raw = await requestGroq(
        apiKey,
        model,
        [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        input.maxOutputTokens,
      );
      console.log("[research] generation:groq_success");
      return raw;
    } catch (error) {
      throw toProviderError(error, apiKey);
    }
  }
}
