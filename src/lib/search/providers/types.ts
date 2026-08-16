import type { WebSearchResult } from "../types";

/**
 * Contract every web search provider implements.
 *
 * `search` returns results already normalized to the app's canonical
 * `WebSearchResult` shape ({ title, url }) and throws a safe `SearchError`
 * on configuration or provider failures — a provider never fabricates a fake
 * success from a failed request. Empty results are a valid outcome and
 * resolve to an empty array.
 */
export interface WebSearchProvider {
  search(query: string): Promise<WebSearchResult[]>;
}
