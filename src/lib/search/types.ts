/**
 * A normalized web search result in the shape the rest of the app consumes.
 *
 * Title and URL come from the provider; `content` is the provider's snippet
 * of the page text (may be empty when the provider returns none). Provider-
 * specific fields (scores, published dates, raw content) are normalized away
 * at the provider boundary so every provider surfaces exactly this shape.
 */
export type WebSearchResult = {
  title: string;
  url: string;
  /** Snippet of the page's text returned by the provider; may be empty. */
  content: string;
};
