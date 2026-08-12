import "server-only";

import { isAiError } from "./errors";
import { generateText } from "./index";

export type ProviderCheckResult = {
  ok: boolean;
  detail: string;
};

const VERIFY_PROMPT = 'Reply with exactly one word: "ok"';

/**
 * Development-only connectivity check. Makes one tiny request against the
 * default Flash-tier model and reports a simple success/failure result.
 *
 * The prompt is fixed so callers can never drive arbitrary generation, and
 * the returned detail never includes the API key or provider internals.
 */
export async function checkAiProviderConnection(): Promise<ProviderCheckResult> {
  try {
    await generateText({
      prompt: VERIFY_PROMPT,
      maxOutputTokens: 8,
    });
    return { ok: true, detail: "AI provider is reachable." };
  } catch (error) {
    if (isAiError(error) && error.code === "NOT_CONFIGURED") {
      return {
        ok: false,
        detail: "AI provider is not configured (GEMINI_API_KEY is missing).",
      };
    }
    return { ok: false, detail: "AI provider could not be reached." };
  }
}
