import type { ResearchContext } from "./context";

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
  resolved: ResolvedCitation[]
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
  resolved: ResolvedCitation[]
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
