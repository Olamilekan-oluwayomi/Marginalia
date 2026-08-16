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
export { isAiClientConfigured } from "./client";

/**
 * Default model used when callers do not ask for a specific one. A cheap,
 * fast Flash-tier model keeps default calls inexpensive.
 *
 * `gemini-2.5-flash` was retired for new API keys and `gemini-3.5-flash`
 * currently returns 503 UNAVAILABLE ("high demand") for this API key, so the
 * default is its lite sibling which stays within the same Flash-tier budget.
 */
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

/**
 * Hard ceiling on a single provider call. Generation is bounded here so a
 * hung provider request cannot run indefinitely; a timeout surfaces as a
 * safe `PROVIDER_ERROR`. This races the call and bounds the caller's await —
 * the SDK does not support aborting non-streaming requests, so the underlying
 * request may still complete (and bill) after the timeout fires.
 */
export const GENERATION_TIMEOUT_MS = 30_000;

/**
 * Bounded retry for transient provider failures (rate limit / overload /
 * temporary outage). A single retry is enough to absorb most 429/503 spikes
 * while staying well inside the workspace route's 60s budget: the worst case
 * is one 30s timeout (never retried) plus at most one retried round trip.
 * Retrying on a timeout would double the worst case and is deliberately
 * excluded — a request that already burned its full budget should fail fast.
 */
export const GENERATION_RETRY_ATTEMPTS = 2;
export const GENERATION_RETRY_BACKOFF_MS = 600;

/**
 * True for provider failures that are worth retrying: HTTP 429/5xx and the
 * equivalent RPC codes. Anything else (invalid request, auth, malformed
 * response, a caller-side timeout, a configuration gap) is permanent and
 * passes through immediately.
 */
export function isTransientProviderError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { status?: unknown; error?: unknown };

  if (
    typeof candidate.status === "number" &&
    TRANSIENT_HTTP_STATUS.has(candidate.status)
  ) {
    return true;
  }

  if (typeof candidate.error === "object" && candidate.error !== null) {
    const rpc = candidate.error as { code?: unknown };
    if (
      typeof rpc.code === "string" &&
      TRANSIENT_RPC_CODES.has(rpc.code)
    ) {
      return true;
    }
  }

  return false;
}

const TRANSIENT_HTTP_STATUS = new Set<number>([429, 500, 502, 503, 504]);
const TRANSIENT_RPC_CODES = new Set<string>([
  "RESOURCE_EXHAUSTED",
  "UNAVAILABLE",
  "DEADLINE_EXCEEDED",
]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `task`, retrying it with a short backoff when it fails with a
 * transient provider error. Permanent errors and the final attempt's error
 * are rethrown as-is so the caller still maps them through `toAiError`.
 */
async function withRetry<T>(task: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= GENERATION_RETRY_ATTEMPTS || !isTransientProviderError(error)) {
        throw error;
      }
      await delay(GENERATION_RETRY_BACKOFF_MS * attempt);
    }
  }
}

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
 * A transient provider failure is retried once before the error surfaces.
 */
export async function generateText(
  input: GenerateTextInput
): Promise<string> {
  try {
    return await withRetry(() => attemptGenerateText(input));
  } catch (error) {
    throw toAiError(error);
  }
}

async function attemptGenerateText(input: GenerateTextInput): Promise<string> {
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
}

/**
 * Generates JSON through the configured AI provider.
 *
 * Unlike `generateText`, the provider is asked to produce a JSON object that
 * conforms to `input.schema`. The raw response text is parsed here so callers
 * receive an already-validated value; a response that is not valid JSON
 * becomes an `INVALID_RESPONSE` error rather than leaking raw provider text.
 * A transient provider failure is retried once before the error surfaces.
 */
export async function generateJson(input: GenerateJsonInput): Promise<unknown> {
  try {
    return await withRetry(() => attemptGenerateJson(input));
  } catch (error) {
    throw toAiError(error);
  }
}

async function attemptGenerateJson(input: GenerateJsonInput): Promise<unknown> {
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
 * NOTE: the live search path no longer calls this. `searchWeb`
 * (`src/lib/search`) delegates to the Tavily provider, so this function is
 * kept only as a tested utility for Gemini-grounding experiments. The URLs
 * come from the provider's grounding metadata — never from the model
 * inventing links. Empty results are a valid outcome and return an empty
 * array. A transient provider failure is retried once before the error
 * surfaces.
 */
export async function searchWebWithGrounding(
  query: string
): Promise<GroundedWebResult[]> {
  try {
    return await withRetry(() => attemptWebSearch(query));
  } catch (error) {
    throw toAiError(error);
  }
}

async function attemptWebSearch(query: string): Promise<GroundedWebResult[]> {
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
}
