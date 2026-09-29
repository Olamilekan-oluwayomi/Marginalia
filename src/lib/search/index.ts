import "server-only";

import { isSearchError, searchError, type SearchError } from "./errors";
import { normalizeResults, SEARCH_QUERY_MAX_LENGTH } from "./normalize";
import { TavilyWebSearchProvider } from "./providers/tavily";
import type { WebSearchResult } from "./types";

export { MAX_SEARCH_RESULTS, SEARCH_QUERY_MAX_LENGTH } from "./normalize";
export type { WebSearchResult } from "./types";

/**
 * Hard ceiling on a single search call. A timed-out search is reported as a
 * safe provider error; the caller (research orchestration) treats it as
 * non-fatal and answers from local context only. The Tavily provider has its
 * own matching timeout; this outer bound keeps the wait finite even if a
 * future provider does not.
 */
const SEARCH_TIMEOUT_MS = 15_000;

/**
 * The provider used for live web search. Holds the Tavily-backed
 * implementation; the `WebSearchProvider` contract keeps the rest of the
 * search layer independent of which provider runs.
 */
const webSearchProvider = new TavilyWebSearchProvider();

/**
 * Reduces a provider/unknown failure to a safe `SearchError`. Providers
 * already return `SearchError` values (including `NOT_CONFIGURED` when their
 * API key is missing); those pass through unchanged. Anything unexpected is
 * logged safely and reduced to a generic provider error.
 */
function toSearchError(error: unknown): SearchError {
  if (isSearchError(error)) {
    return error;
  }
  console.error(
    "[search] web search failed:",
    error instanceof Error ? error.message : String(error),
  );
  return searchError("PROVIDER_ERROR", "Web search could not be completed.");
}

/**
 * Performs a bounded web search and returns normalized results.
 *
 * This is the only search API the research layer imports. The provider is
 * hidden behind the `WebSearchProvider` contract (currently the Tavily
 * provider), so switching providers later does not change callers. Throws a
 * safe `SearchError` on invalid queries, timeouts, or provider failures;
 * empty results return an empty array.
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const trimmed = (query ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > SEARCH_QUERY_MAX_LENGTH) {
    throw searchError("PROVIDER_ERROR", "Search query is empty or too long.");
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(searchError("PROVIDER_ERROR", "Web search timed out.")),
      SEARCH_TIMEOUT_MS,
    );
  });

  try {
    const raw = await Promise.race([
      webSearchProvider.search(trimmed),
      timeout,
    ]);
    return normalizeResults(raw);
  } catch (error) {
    throw toSearchError(error);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
