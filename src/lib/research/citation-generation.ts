import type { ResearchContext, ResearchContextItem } from "./context";
import type { Citation } from "./types";

/**
 * The citation protocol between the model and the server.
 *
 * The model is shown the RESEARCH CONTEXT as a numbered list. Its JSON output
 * cites evidence by 1-based list index (`evidence`), never by document or
 * source id, so it cannot fabricate a reference to an item that was not
 * actually provided. The server resolves `evidence` to the real id before
 * anything is persisted.
 */
export type GeneratedCitation = {
  /** The marker number embedded in the answer text (a positive integer). */
  citation_number: number;
  /** 1-based index into the numbered RESEARCH CONTEXT items. */
  evidence: number;
};

export type GeneratedAnswerOutput = {
  answer: string;
  citations: GeneratedCitation[];
};

/**
 * JSON Schema handed to the provider so the response is already a well-shaped
 * JSON object. Uses the subset Gemini accepts for `responseJsonSchema`
 * (OpenAPI 3.0 style); the server re-validates semantics regardless.
 */
export const ANSWER_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    answer: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          citation_number: {
            type: "integer",
            minimum: 1,
            description: "The marker number [n] used in the answer text.",
          },
          evidence: {
            type: "integer",
            minimum: 1,
            description:
              "1-based position of the supporting item in the numbered RESEARCH CONTEXT list; must be an existing item (between 1 and the number of context items).",
          },
        },
        required: ["citation_number", "evidence"],
      },
    },
  },
  required: ["answer", "citations"],
};

export type GeneratedOutputParseResult =
  | { ok: true; output: GeneratedAnswerOutput }
  | { ok: false; reason: string };

/**
 * Validates the model's JSON output against the citation protocol. Returns a
 * structured failure reason instead of throwing so callers can decide how to
 * surface it.
 */
export function parseGeneratedAnswerOutput(
  value: unknown
): GeneratedOutputParseResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "Expected a JSON object." };
  }
  const record = value as Record<string, unknown>;

  if (typeof record.answer !== "string" || record.answer.trim().length === 0) {
    return { ok: false, reason: "Answer must be a non-empty string." };
  }

  if (!Array.isArray(record.citations)) {
    return { ok: false, reason: "Citations must be an array." };
  }

  const citations: GeneratedCitation[] = [];
  const seenNumbers = new Set<number>();

  for (const entry of record.citations) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, reason: "Each citation must be an object." };
    }
    const { citation_number, evidence } = entry as Record<string, unknown>;

    if (
      typeof citation_number !== "number" ||
      !Number.isInteger(citation_number) ||
      citation_number < 1
    ) {
      return {
        ok: false,
        reason: "Citation numbers must be positive integers.",
      };
    }
    if (typeof evidence !== "number" || !Number.isInteger(evidence) || evidence < 1) {
      return {
        ok: false,
        reason: "Evidence indexes must be positive integers.",
      };
    }
    if (seenNumbers.has(citation_number)) {
      return {
        ok: false,
        reason: `Citation number ${citation_number} is used more than once.`,
      };
    }
    seenNumbers.add(citation_number);
    citations.push({ citation_number, evidence });
  }

  return {
    ok: true,
    output: { answer: record.answer.trim(), citations },
  };
}

export type ResolvedCitation = {
  citation_number: number;
  document_id?: string;
  source_id?: string;
};

export type ResolveCitationsResult = {
  citations: ResolvedCitation[];
  /** Number of generated citations dropped because they could not be verified. */
  rejectedCount: number;
  /**
   * The answer text with citation markers for dropped citations removed, so
   * the persisted answer can never display a dangling `[n]`.
   */
  answer: string;
};

/**
 * Repairs the most common malformed citation marker: a bare sentence-final
 * integer the model wrote instead of a bracketed `[n]` (e.g. "...anomalies 1."
 * instead of "...anomalies [1]."). A bare integer that corresponds to a
 * resolved citation is rewritten to the clickable `[n]` marker the renderer
 * expects; a bare integer that matches no resolved citation is removed, since
 * an invalid marker must never be rendered. Inline integers that are not
 * sentence-final — "0.05", "1, 5, 10 and 30 days", "1961-2018" — are left
 * untouched, and multi-digit values that merely end a sentence (e.g. "...since
 * 1990.") are never erased because they are not plausible marker numbers.
 * Runs before marker stripping so the repaired markers are validated by the
 * same rules as model-written ones.
 */
function normalizeMalformedMarkers(
  answer: string,
  resolved: { citation_number: number }[]
): string {
  const validNumbers = new Set(
    resolved.map((citation) => citation.citation_number)
  );
  let changed = false;
  let cleaned = answer.replace(
    /(^|\s)(\d+)\s*(?=[.!?](?=\s|$)|$)/g,
    (match, prefix: string, digits: string) => {
      const number = Number(digits);
      if (validNumbers.has(number)) {
        return `${prefix}[${digits}]`;
      }
      if (number < 100) {
        changed = true;
        return prefix;
      }
      return match;
    }
  );
  if (changed) {
    cleaned = cleaned.replace(/[ ]{2,}/g, " ").replace(/[ ]+([.,;:!?])/g, "$1");
  }
  return cleaned;
}

/**
 * Removes every `[n]` marker whose number is not among the resolved citation
 * numbers. A marker is only ever valid when its citation resolved to real
 * evidence; stripping the rest keeps a dropped citation from leaving a
 * dangling marker in the rendered answer. Runs at the AI boundary, before the
 * answer is persisted.
 */
function stripUnresolvedCitationMarkers(
  answer: string,
  resolved: { citation_number: number }[]
): string {
  const validNumbers = new Set(
    resolved.map((citation) => citation.citation_number)
  );
  let cleaned = answer.replace(/\[\d+\]/g, (marker) =>
    validNumbers.has(Number(marker.slice(1, -1))) ? marker : ""
  );
  if (cleaned !== answer) {
    cleaned = cleaned.replace(/[ ]{2,}/g, " ").replace(/[ ]+([.,;:!?])/g, "$1");
  }
  return cleaned;
}

/**
 * Resolves each generated citation's evidence index to the context item it
 * refers to, producing exactly the ids to persist.
 *
 * An evidence index is rejected when it points outside the provided context
 * or at an item without real body content. The model may only cite evidence
 * it was actually given — never an item's reference metadata — so citations
 * to content-less items are dropped, never persisted. Markers for dropped
 * citations are also stripped from the answer so no dangling `[n]` can be
 * rendered.
 */
export function resolveCitations(
  output: GeneratedAnswerOutput,
  context: ResearchContext
): ResolveCitationsResult {
  const resolved: ResolvedCitation[] = [];
  let rejectedCount = 0;

  for (const citation of output.citations) {
    const item = context.items[citation.evidence - 1];

    if (!item || item.content.trim().length === 0) {
      rejectedCount += 1;
      continue;
    }

    resolved.push({
      citation_number: citation.citation_number,
      ...(item.kind === "document"
        ? { document_id: item.id }
        : { source_id: item.id }),
    });
  }

  resolved.sort((a, b) => a.citation_number - b.citation_number);
  const normalized = normalizeMalformedMarkers(output.answer, resolved);
  return {
    citations: resolved,
    rejectedCount,
    answer: stripUnresolvedCitationMarkers(normalized, resolved),
  };
}

/**
 * Repairs malformed citation markers in the answer and removes the markers of
 * citations that were dropped during resolution, so the persisted answer can
 * never display a dangling `[n]`. Runs at the AI boundary, before the answer
 * is persisted.
 */
export function sanitizeAnswerMarkers(
  answer: string,
  resolved: { citation_number: number }[]
): string {
  return stripUnresolvedCitationMarkers(
    normalizeMalformedMarkers(answer, resolved),
    resolved
  );
}

export type ResolvedAnswerCitation = Citation & {
  /** The marker number embedded in the answer text (a positive integer). */
  citation_number: number;
  /**
   * The persisted source row a web citation maps to, so the answer layer can
   * attach it as `source_id` exactly once.
   */
  sourceId?: string;
};

export type ToAnswerCitationsResult = {
  citations: ResolvedAnswerCitation[];
  /** Number of generated citations dropped because they could not be verified. */
  rejectedCount: number;
};

/** Bounds on the snippet stored with a citation (mirrors the excerpt cap). */
const CITATION_SNIPPET_MAX_LENGTH = 2_000;

/**
 * Deterministic, content-derived identifier for the passage a document citation
 * points at. Extracted documents are not yet chunked into a dedicated table, so
 * the chunk id identifies the exact passage the model was given rather than a
 * row; identical passages always produce the same id.
 */
function chunkIdOf(item: ResearchContextItem): string {
  let hash = 5381;
  for (let i = 0; i < item.content.length; i += 1) {
    hash = ((hash << 5) + hash + item.content.charCodeAt(i)) >>> 0;
  }
  return `passage-${item.id}-${hash.toString(36)}`;
}

function snippetOf(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > CITATION_SNIPPET_MAX_LENGTH
    ? trimmed.slice(0, CITATION_SNIPPET_MAX_LENGTH)
    : trimmed;
}

/**
 * Extracts the sentence of the answer that carries the `[n]` marker for a
 * citation. Used as the snippet for web citations whose source has no body
 * text: the supporting sentence is the claim the answer itself made, taken
 * verbatim from the model's own output (this layer never writes it).
 */
function answerSentenceForMarker(answer: string, number: number): string {
  const markerPattern = new RegExp(`\\[${number}\\]`);
  const markerIndex = answer.search(markerPattern);
  if (markerIndex === -1) {
    return "";
  }
  let start = markerIndex;
  while (start > 0 && !/[.!?]/.test(answer[start - 1])) start -= 1;
  let end = markerIndex;
  while (end < answer.length && !/[.!?]/.test(answer[end])) end += 1;
  if (end < answer.length) end += 1;
  return answer.slice(start, end).trim();
}

/**
 * Resolves a parsed model answer into the client-facing `Citation[]` shape.
 *
 * An evidence index is rejected when it points outside the provided context,
 * at a document with no body content, or at a source with neither body content
 * nor a URL. Documents map to `type: "document"` citations; sources (web
 * research results and user-pasted sources) map to `type: "web"` citations.
 * Every display field (document id/title, chunk id, snippet, url) is filled
 * from the resolved item's real data — never written by the model — so page
 * numbers, section names and quotes cannot be fabricated. The persisted source
 * row id is carried alongside the web citation so the answer layer can attach
 * it as `source_id`. For a web source without body text the snippet falls back
 * to the answer sentence carrying the marker, taken verbatim from the model's
 * own output. The marker number is kept alongside so the UI can link each
 * `[n]` marker to its citation.
 */
export function toAnswerCitations(
  output: GeneratedAnswerOutput,
  context: ResearchContext
): ToAnswerCitationsResult {
  const citations: ResolvedAnswerCitation[] = [];
  let rejectedCount = 0;

  for (const citation of output.citations) {
    const item = context.items[citation.evidence - 1];
    if (!item) {
      rejectedCount += 1;
      continue;
    }

    if (item.kind === "document") {
      if (item.content.trim().length === 0) {
        rejectedCount += 1;
        continue;
      }
      citations.push({
        citation_number: citation.citation_number,
        type: "document",
        documentId: item.id,
        documentTitle: item.title,
        chunkId: chunkIdOf(item),
        snippet: snippetOf(item.content),
      });
      continue;
    }

    const url = item.metadata.url ?? "";
    const pastedContent = item.content.trim();
    if (!url && pastedContent.length === 0) {
      rejectedCount += 1;
      continue;
    }
    citations.push({
      citation_number: citation.citation_number,
      type: "web",
      sourceId: item.id,
      url,
      title: item.title,
      snippet: snippetOf(
        pastedContent.length > 0
          ? pastedContent
          : answerSentenceForMarker(output.answer, citation.citation_number)
      ),
    });
  }

  citations.sort((a, b) => a.citation_number - b.citation_number);
  return { citations, rejectedCount };
}
