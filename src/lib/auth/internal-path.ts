export function resolveInternalPath(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (!raw) {
    return fallback;
  }

  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }

  try {
    const url = new URL(raw, "http://localhost");
    if (url.origin !== "http://localhost") {
      return fallback;
    }
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
