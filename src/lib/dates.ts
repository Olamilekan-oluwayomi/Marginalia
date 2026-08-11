const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Formats an ISO timestamp as a compact display date (e.g. "10 Aug 2026").
 *
 * Rendered from UTC parts rather than the server's local timezone so the
 * output is deterministic and identical on every machine — no locale- or
 * timezone-dependent drift, and no hydration mismatches.
 */
export function formatDisplayDate(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();

  return `${day} ${month} ${year}`;
}
