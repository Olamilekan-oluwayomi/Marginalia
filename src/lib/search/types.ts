/**
 * A normalized web search result in the shape the rest of the app consumes.
 *
 * Only title and URL are used today: web research persists references as
 * metadata-only sources. Provider-specific fields (snippets, scores,
 * published dates, raw content) are normalized away at the provider boundary
 * so every provider surfaces exactly this shape.
 */
export type WebSearchResult = {
  title: string;
  url: string;
};
