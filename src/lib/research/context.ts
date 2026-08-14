import type { DocumentRow, SourceRow, Supabase } from "./types";
import {
  fail,
  ok,
  validationError,
  type AppResult,
} from "./errors";
import { getDocuments } from "./documents";
import { getSources } from "./sources";
import { requireText, requireUuid } from "./validation";

const QUESTION_MAX_LENGTH = 1000;

/** Upper bound on context items sent to the model in a single answer. */
const MAX_CONTEXT_ITEMS = 6;

/** Upper bound on body text per context item. */
const MAX_CONTENT_CHARS = 2_000;

const STOPWORDS = new Set([
  "about",
  "and",
  "are",
  "can",
  "could",
  "does",
  "from",
  "have",
  "how",
  "should",
  "that",
  "the",
  "their",
  "them",
  "there",
  "these",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "you",
  "your",
]);

export type ResearchContextItem = {
  kind: "document" | "source";
  id: string;
  title: string;
  /**
   * Extracted body text. Documents carry uploaded content; sources carry
   * content only when the user attaches it. Items without content remain
   * reference metadata only and cannot be cited.
   */
  content: string;
  /** Reference metadata that identifies the item. */
  metadata: {
    file_name?: string;
    mime_type?: string;
    publisher?: string;
    url?: string;
  };
};

export type ResearchContext = {
  items: ResearchContextItem[];
  /** True only when at least one item carries real body content. */
  hasBodyContent: boolean;
};

function hostnameOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function keywordsOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word))
  );
}

function toItem(document: DocumentRow): ResearchContextItem {
  return {
    kind: "document",
    id: document.id,
    title: document.title,
    content: document.content ?? "",
    metadata: {
      file_name: document.file_name,
      mime_type: document.mime_type ?? undefined,
    },
  };
}

function toSourceItem(source: SourceRow): ResearchContextItem {
  return {
    kind: "source",
    id: source.id,
    title: source.title,
    content: source.content ?? "",
    metadata: {
      publisher: source.publisher ?? undefined,
      url: source.url ?? undefined,
    },
  };
}

function haystackOf(item: ResearchContextItem): string {
  const { metadata } = item;
  if (item.kind === "document") {
    // Documents are matched against their extracted body text too, so a
    // question can find the right uploaded PDF by what it actually says.
    return [item.title, metadata.file_name ?? "", item.content].join(" ");
  }
  return [
    item.title,
    metadata.publisher ?? "",
    metadata.url ?? "",
    hostnameOf(metadata.url),
  ].join(" ");
}

function relevanceScore(item: ResearchContextItem, keywords: Set<string>): number {
  const haystack = haystackOf(item).toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 1;
  }
  return score;
}

function truncate(content: string): string {
  return content.length > MAX_CONTENT_CHARS
    ? content.slice(0, MAX_CONTENT_CHARS)
    : content;
}

type KeywordHit = { index: number; keyword: string };

/**
 * True when the character at `index` ends a sentence: a `.`, `!` or `?` that
 * is not a decimal point and that is followed by whitespace and then an
 * uppercase letter or digit (the start of the next sentence) — or the end of
 * the content. This keeps "e.g." and "1.5" from being mistaken for sentence
 * boundaries while still recognizing paragraph-final periods.
 */
function isSentenceTerminator(content: string, index: number): boolean {
  const ch = content[index];
  if (ch !== "." && ch !== "!" && ch !== "?") return false;
  if (index > 0 && /[0-9]/.test(content[index - 1])) return false;
  let next = index + 1;
  while (next < content.length && /\s/.test(content[next])) next += 1;
  if (next >= content.length) return true;
  return /[A-Z0-9]/.test(content[next]);
}

/** Index just after the terminator of the sentence containing `position`. */
function sentenceEndIndex(content: string, position: number): number {
  for (let i = position; i < content.length; i += 1) {
    if (isSentenceTerminator(content, i)) return i + 1;
  }
  return content.length;
}

/** First non-whitespace index of the sentence containing `position`. */
function sentenceStartIndex(content: string, position: number): number {
  let start = 0;
  for (let i = position - 1; i >= 0; i -= 1) {
    if (isSentenceTerminator(content, i)) {
      start = i + 1;
      break;
    }
  }
  while (start < content.length && /\s/.test(content[start])) start += 1;
  return start;
}

/** First non-whitespace index of the sentence after the one at `position`. */
function nextSentenceStartIndex(content: string, position: number): number {
  let start = sentenceEndIndex(content, position);
  while (start < content.length && /\s/.test(content[start])) start += 1;
  return start;
}

/**
 * Word-boundary start indexes of every question keyword in the lowercased
 * content, tagged with the keyword that produced each hit. Keywords are
 * already `[a-z0-9]+` tokens, so no escaping is needed.
 */
function keywordHits(content: string, keywords: Set<string>): KeywordHit[] {
  const haystack = content.toLowerCase();
  const hits: KeywordHit[] = [];
  for (const keyword of keywords) {
    const pattern = new RegExp(`\\b${keyword}\\b`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(haystack)) !== null) {
      hits.push({ index: match.index, keyword });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits;
}

/**
 * Multi-word question concepts: runs of 2-3 consecutive keyword tokens exactly
 * as they appear in the question (e.g. "recurrence intervals",
 * "extreme precipitation events"). An exact phrase match carries far more
 * evidence than its individual words appearing far apart, so the passage
 * ranker weighs it higher.
 */
function phrasesOf(question: string, keywords: Set<string>): string[][] {
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const phrases: string[][] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const phrase: string[] = [];
    for (let j = i; j < tokens.length && phrase.length < 3; j += 1) {
      if (!keywords.has(tokens[j])) break;
      phrase.push(tokens[j]);
      if (phrase.length >= 2) phrases.push([...phrase]);
    }
  }
  return phrases;
}

/**
 * Returns the `[start, end]` span of the highest-scoring window of keyword
 * hits (all hits within `MAX_CONTENT_CHARS`). Windows are scored by the number
 * of *distinct* question keywords they cover, plus bonuses for exact
 * multi-word phrase matches and for keywords sitting next to a numeric value —
 * the hallmarks of an actual definitional sentence. Counting raw hits instead
 * lets a generic passage that repeats one or two question words many times
 * (e.g. "1-day, 1-yr recurrence interval extreme rainfall events") beat the
 * real methodology sentence, so the score rewards coverage, not repetition.
 */
function bestCluster(
  hits: KeywordHit[],
  phrases: string[][],
  content: string
): [number, number] {
  let bestStart = hits[0].index;
  let bestEnd = hits[0].index;
  let bestScore = -Infinity;
  let left = 0;

  for (let right = 0; right < hits.length; right += 1) {
    while (hits[right].index - hits[left].index > MAX_CONTENT_CHARS) {
      left += 1;
    }

    const windowHits = hits.slice(left, right + 1);
    const windowStart = hits[left].index;
    const windowEnd = hits[right].index;
    const span = content.slice(windowStart, windowEnd);

    const distinct = new Set(windowHits.map((hit) => hit.keyword)).size;

    let phraseCount = 0;
    for (const phrase of phrases) {
      const pattern = new RegExp(`\\b${phrase.join("\\s+")}\\b`, "i");
      if (pattern.test(span)) phraseCount += 1;
    }

    let numericKeywords = 0;
    const numericSeen = new Set<string>();
    for (const hit of windowHits) {
      if (numericSeen.has(hit.keyword)) continue;
      const around = content.slice(
        Math.max(0, hit.index - 20),
        hit.index + 20
      );
      if (/[0-9]/.test(around)) {
        numericKeywords += 1;
        numericSeen.add(hit.keyword);
      }
    }

    const score = distinct * 10 + phraseCount * 15 + numericKeywords * 5;
    if (score > bestScore) {
      bestScore = score;
      bestStart = windowStart;
      bestEnd = windowEnd;
    }
  }

  return [bestStart, bestEnd];
}

/**
 * Returns the most relevant stretch of a long document, bounded to
 * `MAX_CONTENT_CHARS`. The window is anchored on the sentence that carries the
 * best-scoring cluster's tail evidence so that a value or definition running
 * past the last keyword hit is still included, then centred and snapped out to
 * sentence/word boundaries; when nothing in the content matches, the leading
 * chunk is returned instead so the budget is always respected.
 */
function selectRelevantPassage(
  content: string,
  keywords: Set<string>,
  phrases: string[][]
): string {
  if (content.length <= MAX_CONTENT_CHARS) {
    return content;
  }

  const hits = keywordHits(content, keywords);
  if (hits.length === 0) {
    return truncate(content);
  }

  const budget = MAX_CONTENT_CHARS;
  const [clusterStart, clusterEnd] = bestCluster(hits, phrases, content);

  // Anchor on the sentence containing the cluster's last hit. That hit can
  // land just before the continuation of an evidence-bearing statement (e.g. a
  // value word split by the PDF extractor), so the window must reach the end
  // of that sentence instead of stopping at the last matched keyword.
  const anchorStart = sentenceStartIndex(content, clusterEnd);
  const anchorEnd = sentenceEndIndex(content, clusterEnd);
  const requiredStart = Math.min(clusterStart, anchorStart);
  const requiredEnd = anchorEnd;

  let from: number;
  let to: number;
  if (requiredEnd - requiredStart <= budget) {
    const span = requiredEnd - requiredStart;
    const head = Math.floor((budget - span) / 2);
    const tail = budget - span - head;
    from = Math.max(0, requiredStart - head);
    to = Math.min(content.length, requiredEnd + tail);
  } else {
    // The cluster spans sentences wider than the budget; anchor on the
    // evidence sentence itself so its statement stays complete.
    const span = anchorEnd - anchorStart;
    const head = Math.floor((budget - span) / 2);
    const tail = budget - span - head;
    from = Math.max(0, anchorStart - head);
    to = Math.min(content.length, anchorEnd + tail);
  }

  // Redistribute the leftover budget when the window sits against either
  // edge of the document so the window still uses the full budget.
  if (from === 0) {
    to = Math.min(content.length, from + budget);
  } else if (to === content.length) {
    from = Math.max(0, to - budget);
  }

  // Align the end to sentence boundaries so the passage never stops mid-way
  // through an evidence-bearing continuation. The start advances sentence by
  // sentence to keep the window within budget, but never past the start of
  // the required span, so the cluster's earlier evidence is never traded away
  // for continuation context.
  while (to < content.length) {
    const nextEnd = sentenceEndIndex(content, to);
    if (nextEnd <= to) break;
    if (nextEnd - from > budget) {
      const nextStart = nextSentenceStartIndex(content, from);
      if (nextStart <= from || nextStart > requiredStart) break;
      from = nextStart;
      continue;
    }
    to = nextEnd;
  }

  // Word-boundary snap for whatever remains, keeping an already-reached
  // sentence terminator so the statement stays complete.
  while (from > 0 && !/\s/.test(content[from - 1])) from -= 1;
  if (to > from + budget) to = from + budget;
  while (
    to > from &&
    !/\s/.test(content[to - 1]) &&
    !isSentenceTerminator(content, to - 1)
  ) {
    to -= 1;
  }

  const passage = content.slice(from, to).trim();

  return passage;
}

/**
 * Retrieves the research-owned context available for an answer: the
 * research's documents and sources, deterministically ranked by how well
 * they match the question, then bounded.
 *
 * Only `ready` documents are eligible: a document's extracted text is only
 * usable for answering once `documents.content` has been persisted and the
 * document has been marked ready. Pending/processing/failed documents are
 * ignored. Sources are always eligible (they are reference metadata; only
 * those the user attached body text to are citable).
 *
 * Ownership is enforced by the existing data layer (RLS-scoped Supabase), so
 * a caller can never reach another user's documents or sources. The returned
 * payload is what the model may treat as evidence: documents carry extracted
 * body text, sources carry body text only when the user attached it, and
 * items without body text are reference metadata only (never citable).
 */
export async function retrieveResearchContext(
  supabase: Supabase,
  researchId: string,
  question: string
): Promise<AppResult<ResearchContext>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), {
      items: [],
      hasBodyContent: false,
    });
  }
  const questionError = requireText(
    question,
    "Question",
    QUESTION_MAX_LENGTH
  );
  if (questionError) {
    return fail(validationError(questionError.message), {
      items: [],
      hasBodyContent: false,
    });
  }

  const [documentsResult, sourcesResult] = await Promise.all([
    getDocuments(supabase, researchId),
    getSources(supabase, researchId),
  ]);
  if (documentsResult.error) {
    return fail(documentsResult.error, { items: [], hasBodyContent: false });
  }
  if (sourcesResult.error) {
    return fail(sourcesResult.error, { items: [], hasBodyContent: false });
  }

  const keywords = keywordsOf(question);
  const phrases = phrasesOf(question, keywords);

  const documentItems = documentsResult.data
    .filter((document) => document.status === "ready")
    .map(toItem);
  const sourceItems = sourcesResult.data.map(toSourceItem);

  const selected = [...documentItems, ...sourceItems]
    .map((item) => ({ item, score: relevanceScore(item, keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.title.localeCompare(b.item.title);
    })
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((entry) =>
      entry.item.kind === "document"
        ? {
            ...entry.item,
            content: selectRelevantPassage(entry.item.content, keywords, phrases),
          }
        : { ...entry.item, content: truncate(entry.item.content) }
    );

  return ok({
    items: selected,
    hasBodyContent: selected.some((item) => item.content.trim().length > 0),
  });
}

/**
 * Formats a research context as the labeled evidence block that accompanies
 * the question in the model prompt. Items are explicitly marked as untrusted
 * evidence; items without body text are labeled reference metadata only.
 */
export function buildContextSection(context: ResearchContext): string | null {
  if (context.items.length === 0) {
    return null;
  }

  const lines = context.items.map((item, index) => {
    const kind = item.kind === "document" ? "Document" : "Source";
    const meta: string[] = [];
    if (item.kind === "document") {
      if (item.metadata.file_name) meta.push(item.metadata.file_name);
      if (item.metadata.mime_type) meta.push(item.metadata.mime_type);
    } else {
      if (item.metadata.publisher) meta.push(item.metadata.publisher);
      if (item.metadata.url) meta.push(item.metadata.url);
    }

    const header = `${index + 1}. [${kind}] ${item.title}${
      meta.length > 0 ? ` (${meta.join(", ")})` : ""
    }`;

    if (item.content.trim().length > 0) {
      return `${header}\n${item.content.trim()}`;
    }
    return `${header} — reference metadata only; contents not available.`;
  });

  return `RESEARCH CONTEXT (untrusted evidence supplied to you)\n${lines.join(
    "\n\n"
  )}`;
}

/**
 * Composes the model prompt: the research question first, then the research
 * context as a clearly separated, labeled evidence block (when present).
 * The question text always comes from the database.
 */
export function buildResearchPrompt(
  question: string,
  context: ResearchContext
): string {
  const contextSection = buildContextSection(context);
  const questionBlock = `Research question:\n${question}`;
  return contextSection
    ? `${questionBlock}\n\n${contextSection}`
    : questionBlock;
}
