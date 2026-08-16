import "server-only";

import { isAiError } from "@/lib/ai";
import { isAppError } from "../errors";

/**
 * HTTP statuses that signal a provider is temporarily overloaded or
 * rate-limited and worth retrying on a fallback provider.
 */
const TRANSIENT_HTTP_STATUS = new Set<number>([429, 500, 502, 503, 504]);

/**
 * Provider RPC codes that signal the same transient conditions. Gemini
 * surfaces these as `error.code` on the raw SDK failure; they are preserved
 * on `AiError` by `toAiError`.
 */
const TRANSIENT_RPC_CODES = new Set<string>([
  "RESOURCE_EXHAUSTED",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "INTERNAL",
]);

/**
 * Whether a generation failure is worth retrying on the fallback provider.
 *
 * Only transient conditions (rate limit / overload / temporary outage)
 * qualify: retrying is pointless and wasteful for a permanent failure such
 * as an invalid request, a configuration gap, or a malformed response, which
 * will fail identically on the fallback. Classification uses the markers
 * preserved on the normalized `AiError` (`status` / `rpcCode`); raw provider
 * failures that never went through normalization are classified from their
 * own shape so the decision works regardless of how the error arrived.
 */
export function isLlmFallbackEligible(error: unknown): boolean {
  if (isAppError(error)) {
    return false;
  }

  if (isAiError(error)) {
    if (error.status !== undefined) {
      return TRANSIENT_HTTP_STATUS.has(error.status);
    }
    if (error.rpcCode !== undefined) {
      return TRANSIENT_RPC_CODES.has(error.rpcCode);
    }
    return false;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    status?: unknown;
    error?: { code?: unknown };
    code?: unknown;
  };

  if (
    typeof candidate.status === "number" &&
    TRANSIENT_HTTP_STATUS.has(candidate.status)
  ) {
    return true;
  }

  if (
    typeof candidate.error === "object" &&
    candidate.error !== null &&
    typeof candidate.error.code === "string" &&
    TRANSIENT_RPC_CODES.has(candidate.error.code)
  ) {
    return true;
  }

  if (
    typeof candidate.code === "string" &&
    TRANSIENT_RPC_CODES.has(candidate.code)
  ) {
    return true;
  }

  return false;
}
