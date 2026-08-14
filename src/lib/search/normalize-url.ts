/**
 * Canonical form of a web URL used for duplicate detection.
 *
 * Two URLs that point at the same resource should collapse to the same key:
 * host casing, trailing slashes, fragments, and marketing tracking parameters
 * are all presentation noise. Genuinely distinct resources (different paths,
 * different schemes, or different non-tracking query parameters) stay
 * distinct so deduplication never merges real content.
 */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
]);

function stripTrackingParams(url: URL): void {
  const keys = Array.from(url.searchParams.keys());
  for (const key of keys) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
}

function buildCanonical(url: URL): string {
  url.searchParams.sort();
  let path = url.pathname;
  while (path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  const query = url.searchParams.toString();
  return `${url.protocol}//${url.hostname.toLowerCase()}${path}${
    query ? `?${query}` : ""
  }`;
}

/**
 * Returns a canonical key for a web URL, or the trimmed input unchanged when
 * the value is not a well-formed http(s) URL (non-web values cannot be
 * deduplicated and must not be merged or dropped).
 */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return trimmed;
  }
  stripTrackingParams(url);
  return buildCanonical(url);
}
