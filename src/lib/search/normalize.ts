import type { WebSearchResult } from "./types";
import { normalizeUrl } from "./normalize-url";

/**
 * Upper bound on the search query sent to a provider.
 */
export const SEARCH_QUERY_MAX_LENGTH = 500;

/**
 * Upper bound on web results kept after normalization. Keeps the context
 * payload small and provider usage bounded.
 */
export const MAX_SEARCH_RESULTS = 5;

export function sanitizeText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalizes raw provider results into the app's canonical `WebSearchResult`
 * shape: keeps only well-formed http(s) URLs, deduplicates by canonical URL,
 * sanitizes titles and content, and bounds the result count. Shared by every
 * provider so each one surfaces exactly the same normalized output.
 */
export function normalizeResults(raw: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>();
  const results: WebSearchResult[] = [];

  for (const entry of raw) {
    if (!isValidUrl(entry.url)) continue;
    const key = normalizeUrl(entry.url);
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      title: sanitizeText(entry.title) || entry.url,
      url: entry.url,
      content: sanitizeText(entry.content),
    });

    if (results.length >= MAX_SEARCH_RESULTS) break;
  }

  return results;
}
