/**
 * Display helpers for web sources. Dependency-free and deterministic so the
 * render logic can be unit-tested without a DOM.
 */

/**
 * Returns the hostname of a web URL without the leading `www.` prefix, or an
 * empty string when the value is not a well-formed URL. Safe for display: no
 * protocol or path is ever included.
 */
export function hostnameFromUrl(url: string | null | undefined): string {
  if (!url) {
    return "";
  }
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return "";
  }
}
