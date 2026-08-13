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
          citation_number: { type: "integer" },
          evidence: { type: "integer" },
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
};

/**
 * Resolves each generated citation's evidence index to the context item it
 * refers to, producing exactly the ids to persist.
 *
 * An evidence index is rejected when it points outside the provided context
 * or at an item without real body content. The model may only cite evidence
 * it was actually given — never an item's reference metadata — so citations
 * to content-less items are dropped, never persisted.
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
  return { citations: resolved, rejectedCount };
}
