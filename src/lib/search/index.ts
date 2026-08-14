import "server-only";

import {
  isAiError,
  searchWebWithGrounding,
  type GroundedWebResult,
} from "@/lib/ai";
import {
  isSearchError,
  searchError,
  type SearchError,
} from "./errors";
import { normalizeUrl } from "./normalize-url";

/**
 * Upper bound on the search query sent to the provider.
 */
export const SEARCH_QUERY_MAX_LENGTH = 500;

/**
 * Upper bound on web results kept after normalization. Keeps the context
 * payload small and the provider usage bounded.
 */
export const MAX_SEARCH_RESULTS = 5;

/**
 * Hard ceiling on a single search call. A timed-out search is reported as a
 * safe provider error; the caller (research orchestration) treats it as
 * non-fatal and answers from local context only.
 */
const SEARCH_TIMEOUT_MS = 15_000;

export type WebSearchResult = {
  title: string;
  url: string;
};

function sanitizeTitle(title: string): string {
  return title
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Reduces a provider/unknown failure to a safe `SearchError`. The provider's
 * own `NOT_CONFIGURED` is preserved (the API key is missing); everything else
 * becomes a generic provider error. Raw details are logged for developers,
 * never surfaced to UI callers.
 */
function toSearchError(error: unknown): SearchError {
  if (isSearchError(error)) {
    return error;
  }
  if (isAiError(error)) {
    return error.code === "NOT_CONFIGURED"
      ? searchError("NOT_CONFIGURED", error.message)
      : searchError("PROVIDER_ERROR", "Web search could not be completed.");
  }
  console.error(
    "[search] web search failed:",
    error instanceof Error ? error.message : String(error)
  );
  return searchError("PROVIDER_ERROR", "Web search could not be completed.");
}

/**
 * Normalizes raw grounding results: keeps only well-formed http(s) URLs,
 * deduplicates by canonical URL, sanitizes titles, and bounds the result
 * count.
 */
function normalizeResults(raw: GroundedWebResult[]): WebSearchResult[] {
  const seen = new Set<string>();
  const results: WebSearchResult[] = [];

  for (const entry of raw) {
    if (!isValidUrl(entry.url)) continue;
    const key = normalizeUrl(entry.url);
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      title: sanitizeTitle(entry.title) || entry.url,
      url: entry.url,
    });

    if (results.length >= MAX_SEARCH_RESULTS) break;
  }

  return results;
}

/**
 * Performs a bounded web search and returns normalized results.
 *
 * This is the only search API the research layer imports. The provider is
 * hidden behind the AI layer (`searchWebWithGrounding`), so switching search
 * providers later does not change callers. Throws a safe `SearchError` on
 * invalid queries, timeouts, or provider failures; empty results return an
 * empty array.
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const trimmed = (query ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > SEARCH_QUERY_MAX_LENGTH) {
    throw searchError(
      "PROVIDER_ERROR",
      "Search query is empty or too long."
    );
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(searchError("PROVIDER_ERROR", "Web search timed out.")),
      SEARCH_TIMEOUT_MS
    );
  });

  try {
    const raw = await Promise.race([
      searchWebWithGrounding(trimmed),
      timeout,
    ]);
    return normalizeResults(raw);
  } catch (error) {
    throw toSearchError(error);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
