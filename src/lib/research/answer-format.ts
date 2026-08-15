/**
 * Pure formatting helpers for rendering generated answers. Kept dependency-free
 * and fully deterministic so the exact render logic can be unit-tested without
 * a DOM: the workspace page builds paragraphs and inline `[n]` citation markers
 * from these segments, and the same rules are covered in answer-format tests.
 */

/** A segment of an answer paragraph that is either plain text or a `[n]` marker. */
export type AnswerTextSegment = {
  kind: "text";
  text: string;
};

export type AnswerMarkerSegment = {
  kind: "marker";
  number: number;
};

export type AnswerSegment = AnswerTextSegment | AnswerMarkerSegment;

const PARAGRAPH_SEPARATOR = /\n\s*\n/;
const MARKER_PATTERN = /(\[\d+\])/g;
const MARKER_EXACT = /^\[(\d+)\]$/;

/**
 * Splits an answer's raw content into trimmed, non-empty paragraphs. Blank
 * lines (and whitespace-only lines between them) separate paragraphs.
 */
export function splitAnswerParagraphs(content: string): string[] {
  return content
    .split(PARAGRAPH_SEPARATOR)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * Splits one answer paragraph into an ordered list of text and `[n]` marker
 * segments. A marker segment is produced only for a piece that is exactly
 * `[n]` (single or multi-digit); digits embedded in words or URLs are plain
 * text and never treated as citation markers.
 */
export function splitAnswerMarkers(paragraph: string): AnswerSegment[] {
  const segments: AnswerSegment[] = [];

  for (const piece of paragraph.split(MARKER_PATTERN)) {
    if (piece.length === 0) {
      continue;
    }
    const match = MARKER_EXACT.exec(piece);
    if (match) {
      segments.push({ kind: "marker", number: Number(match[1]) });
    } else {
      segments.push({ kind: "text", text: piece });
    }
  }

  return segments;
}

/**
 * Removes inline `[n]` citation markers from display text, collapsing the
 * whitespace they leave behind. Used for footnote excerpts that are themselves
 * a claim sentence taken verbatim from the answer (web citations whose source
 * has no body text), so the note shows clean prose rather than a duplicate
 * marker.
 */
export function stripCitationMarkers(text: string): string {
  return text
    .replace(/\[\d+\]/g, "")
    .replace(/[ ]{2,}/g, " ")
    .replace(/[ ]+([.,;:!?])/g, "$1")
    .trim();
}
