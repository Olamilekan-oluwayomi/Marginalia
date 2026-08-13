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
    return [item.title, metadata.file_name ?? ""].join(" ");
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

/**
 * Retrieves the research-owned context available for an answer: the
 * research's documents and sources, deterministically ranked by how well
 * their metadata matches the question, then bounded.
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

  const items: ResearchContextItem[] = [
    ...documentsResult.data.map(toItem),
    ...sourcesResult.data.map(toSourceItem),
  ].map((item) => ({ ...item, content: truncate(item.content) }));

  const keywords = keywordsOf(question);
  const selected = items
    .map((item) => ({ item, score: relevanceScore(item, keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.title.localeCompare(b.item.title);
    })
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((entry) => entry.item);

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
