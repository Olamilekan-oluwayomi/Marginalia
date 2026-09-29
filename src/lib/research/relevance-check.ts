import "server-only";

import { aiError, generateText } from "@/lib/ai";

/**
 * The result of a relevance check: whether the document is likely to answer
 * the question, how confident the classifier is, and a one-sentence reason.
 */
export type RelevanceResult = {
  relevant: boolean;
  confidence: number;
  reason: string;
};

/**
 * Ceiling on generated tokens: the response is a tiny JSON object, so the
 * budget is deliberately small to keep the call fast and inexpensive.
 */
const MAX_OUTPUT_TOKENS = 200;

const RELEVANCE_SYSTEM_PROMPT = `You are a relevance classifier. You will be given a user's question and a short summary or set of excerpts from a document. Determine whether the document is likely to contain information that answers the question.

Respond ONLY with JSON, no other text:
{
  "relevant": true | false,
  "confidence": 0.0-1.0,
  "reason": "one short sentence"
}

Be strict: if the question is about a clearly unrelated topic (e.g. weather, general knowledge, current events) and the document is about something else entirely, mark relevant: false.`;

/**
 * How the user's question explicitly directs search scope. `null` when the
 * question carries no explicit instruction and the smart-mode relevance check
 * should decide.
 */
export type ExplicitSearchIntent = "document" | "web" | "both" | null;

const DOCUMENT_INTENT_PHRASES = [
  "check the document",
  "use the document",
  "read the document",
  "search the document",
  "in the document",
  "from the document",
  "based on the document",
  "the attached document",
  "the uploaded document",
  "in my document",
  "my uploaded document",
];

const WEB_INTENT_PHRASES = [
  "search the web",
  "use the web",
  "from the web",
  "on the web",
  "web search",
  "use web search",
  "look it up online",
  "search online",
  "google it",
  "on the internet",
  "look it up on the internet",
];

const BOTH_INTENT_PHRASES = [
  "use both",
  "use both sources",
  "both the document and the web",
  "both the web and the document",
  "the document and the web",
  "the web and the document",
  "use the document and the web",
  "use the web and the document",
];

/**
 * Detects an explicit search-scope instruction in the question. A deliberate
 * basic keyword/phrase check: "both" beats "document" beats "web" so a shared
 * phrase like "search the web and check the document" still lands on the
 * broader "both". Unclear questions return `null` and let the relevance check
 * decide.
 */
export function detectExplicitSearchIntent(
  question: string,
): ExplicitSearchIntent {
  const text = question.toLowerCase();
  if (BOTH_INTENT_PHRASES.some((phrase) => text.includes(phrase))) {
    return "both";
  }
  if (DOCUMENT_INTENT_PHRASES.some((phrase) => text.includes(phrase))) {
    return "document";
  }
  if (WEB_INTENT_PHRASES.some((phrase) => text.includes(phrase))) {
    return "web";
  }
  return null;
}

function buildPrompt(question: string, documentText: string): string {
  return `User question:\n${question}\n\nDocument:\n${documentText}`;
}

/**
 * Extracts the JSON payload from the model's raw text. Strips markdown code
 * fences and any prose that precedes or follows the object, then slices to the
 * first `{` / last `}` pair. Throws an `INVALID_RESPONSE` error when no JSON
 * object can be found.
 */
function extractJsonPayload(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw aiError(
      "INVALID_RESPONSE",
      "The relevance classifier returned no parseable JSON object.",
    );
  }
  return candidate.slice(start, end + 1);
}

function requireResultShape(parsed: unknown): RelevanceResult {
  if (typeof parsed !== "object" || parsed === null) {
    throw aiError(
      "INVALID_RESPONSE",
      "The relevance classifier returned a non-object response.",
    );
  }
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.relevant !== "boolean") {
    throw aiError(
      "INVALID_RESPONSE",
      'The relevance classifier response is missing a boolean "relevant" field.',
    );
  }
  if (
    typeof candidate.confidence !== "number" ||
    !Number.isFinite(candidate.confidence) ||
    candidate.confidence < 0 ||
    candidate.confidence > 1
  ) {
    throw aiError(
      "INVALID_RESPONSE",
      "The relevance classifier response is missing a confidence between 0 and 1.",
    );
  }
  if (
    typeof candidate.reason !== "string" ||
    candidate.reason.trim().length === 0
  ) {
    throw aiError(
      "INVALID_RESPONSE",
      "The relevance classifier response is missing a reason string.",
    );
  }
  return {
    relevant: candidate.relevant,
    confidence: candidate.confidence,
    reason: candidate.reason.trim(),
  };
}

function parseRelevanceResult(text: string): RelevanceResult {
  const payload = extractJsonPayload(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw aiError(
      "INVALID_RESPONSE",
      "The relevance classifier returned malformed JSON.",
    );
  }
  return requireResultShape(parsed);
}

/**
 * Checks whether a document is likely relevant to a user's question before
 * deciding whether to search the document or fall back to web search.
 *
 * The full supplied document text is passed to the classifier; the caller
 * (smart mode in `generateAnswer`) is responsible for bounding pathological
 * inputs before calling this.
 */
export async function checkDocumentRelevance(
  question: string,
  documentSummaryOrChunks: string,
): Promise<RelevanceResult> {
  const raw = await generateText({
    prompt: buildPrompt(question, documentSummaryOrChunks),
    system: RELEVANCE_SYSTEM_PROMPT,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
  return parseRelevanceResult(raw);
}
