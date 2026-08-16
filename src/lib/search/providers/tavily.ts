import "server-only";

import {
  isSearchError,
  searchError,
  type SearchError,
} from "../errors";
import {
  MAX_SEARCH_RESULTS,
  normalizeResults,
  SEARCH_QUERY_MAX_LENGTH,
} from "../normalize";
import type { WebSearchResult } from "../types";
import type { WebSearchProvider } from "./types";

/**
 * Environment variable holding the Tavily API key. Read on the server only;
 * never logged, never exposed to the client.
 */
const TAVILY_API_KEY_ENV = "TAVILY_API_KEY";

const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";

/**
 * Hard ceiling on a single Tavily call. Matches the app's bounded search
 * budget; a hung provider request cannot run indefinitely.
 */
export const TAVILY_TIMEOUT_MS = 15_000;

/**
 * Whether the Tavily API key is present in the environment. Used to log
 * configuration presence without ever logging the key itself.
 */
export function isTavilyConfigured(): boolean {
  return Boolean(process.env[TAVILY_API_KEY_ENV]);
}

/** The subset of the Tavily response this app consumes. */
type TavilyResult = {
  title?: string;
  url?: string;
  /** Tavily's snippet of the page's text (empty when the provider returns none). */
  content?: string;
};

type TavilyResponse = {
  results?: TavilyResult[];
};

/**
 * Removes any occurrence of the API key from a value so it can never leak
 * into logs or an error message, even if the provider echoes it back.
 */
function redact(value: string, apiKey: string): string {
  return value.split(apiKey).join("[redacted]");
}

/**
 * Pulls a safe message out of a Tavily error body (their `detail`/`error`
 * fields), redacting the API key, or falls back to a status-based message.
 */
function extractErrorMessage(body: unknown, status: number, apiKey: string): string {
  if (typeof body === "object" && body !== null) {
    const candidate = (body as { detail?: unknown; error?: unknown }).detail
      ?? (body as { detail?: unknown; error?: unknown }).error;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return redact(candidate.trim(), apiKey);
    }
  }
  return `Web search could not be completed (HTTP ${status}).`;
}

async function requestTavily(
  apiKey: string,
  query: string
): Promise<TavilyResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

  try {
    const response = await fetch(TAVILY_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: MAX_SEARCH_RESULTS,
        search_depth: "basic",
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
      throw searchError(
        "PROVIDER_ERROR",
        extractErrorMessage(body, response.status, apiKey)
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !Array.isArray((body as TavilyResponse).results)
    ) {
      throw searchError(
        "PROVIDER_ERROR",
        "Web search could not be completed."
      );
    }
    return body as TavilyResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Reduces a provider/unknown failure to a safe `SearchError`. Logs only the
 * safe, redacted message — never the request, headers, or the API key.
 */
function toProviderError(error: unknown, apiKey: string): SearchError {
  if (isSearchError(error)) {
    console.error("[tavily] search failed:", redact(error.message, apiKey));
    return error;
  }
  if (error instanceof Error && error.name === "AbortError") {
    console.error("[tavily] search failed:", "Web search timed out.");
    return searchError("PROVIDER_ERROR", "Web search timed out.");
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error("[tavily] search failed:", redact(message, apiKey));
  return searchError("PROVIDER_ERROR", "Web search could not be completed.");
}

/**
 * Tavily-backed web search provider.
 *
 * Reads `TAVILY_API_KEY` from the environment at call time, calls Tavily's
 * `/search` endpoint, and normalizes the response into the app's canonical
 * `WebSearchResult` shape ({ title, url, content }) via the shared
 * normalization used by every provider.
 *
 * Not yet wired into the live research flow — importable for use as an
 * alternate provider behind the `WebSearchProvider` contract.
 */
export class TavilyWebSearchProvider implements WebSearchProvider {
  async search(query: string): Promise<WebSearchResult[]> {
    console.log(
      `[research] webSearch:config tavilyApiKeyConfigured=${isTavilyConfigured()}`
    );

    const apiKey = process.env[TAVILY_API_KEY_ENV];
    if (!apiKey) {
      throw searchError(
        "NOT_CONFIGURED",
        "TAVILY_API_KEY is not set. Add it to .env.local to enable Tavily web search."
      );
    }

    const trimmed = (query ?? "").trim();
    if (trimmed.length === 0 || trimmed.length > SEARCH_QUERY_MAX_LENGTH) {
      throw searchError("PROVIDER_ERROR", "Search query is empty or too long.");
    }

    try {
      const response = await requestTavily(apiKey, trimmed);
      return normalizeResults(
        (response.results ?? []).map((result) => ({
          title: result.title ?? "",
          url: result.url ?? "",
          content: result.content ?? "",
        }))
      );
    } catch (error) {
      throw toProviderError(error, apiKey);
    }
  }
}
