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
import { normalizeUrl } from "@/lib/search/normalize-url";

const QUESTION_MAX_LENGTH = 1000;

/** Upper bound on context items sent to the model in a single answer. */
const MAX_CONTEXT_ITEMS = 6;

/** Upper bound on body text per context item. */
const MAX_CONTENT_CHARS = 2_000;

/**
 * A secondary value-bearing region must score at least this fraction of the
 * primary cluster's score to be surfaced as additional evidence. Keeps
 * incidental passages that merely carry the same number out of the context.
 */
const VALUE_CANDIDATE_SCORE_RATIO = 0.45;

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

/**
 * Window (in characters) around a keyword hit within which a numeric token is
 * treated as evidence for a value-seeking question. Tight enough that the
 * number must genuinely belong to the concept being described.
 */
const VALUE_WINDOW = 25;

/**
 * Words and phrases that mark a question as asking for a precise factual
 * value — a significance level, threshold, percentage, interval, year or
 * count. When present, numeric tokens near the question's concepts are treated
 * as evidence, so a passage carrying the actual value ("statistical
 * significance level (a = 0.05)") outranks passages that only repeat the
 * question's words ("significant", "significance") without the number.
 */
const VALUE_MARKERS: readonly string[] = [
  "level",
  "levels",
  "value",
  "values",
  "threshold",
  "thresholds",
  "percentage",
  "percent",
  "proportion",
  "how many",
  "how much",
  "which year",
  "what year",
  "what value",
  "what level",
  "at what",
  "interval",
  "intervals",
  "amount",
  "amounts",
  "number of",
  "confidence level",
  "significance level",
];

/**
 * True when the question asks for a precise factual value. Value markers are
 * matched as substrings of the lowercased question so that multi-word phrasings
 * ("at what statistical significance level", "how many stations") trigger the
 * value-evidence reward. This never hardcodes any specific answer.
 */
function isValueSeeking(question: string): boolean {
  const text = question.toLowerCase();
  return VALUE_MARKERS.some((marker) => text.includes(marker));
}

/**
 * Value-bearing concept phrases. A *phrase* next to a number is the hallmark
 * of a definitional or methodological statement: "statistical significance
 * level (a = 0.05)" is evidence, whereas "statistically significant ... 0.05"
 * (the words apart, no "significance level" phrase) is not. Treating
 * "significance level" as a phrase rather than as two independent keywords is
 * what separates the methodology sentence from a passage that merely reports a
 * correlation.
 */
const VALUE_CONCEPTS: readonly (readonly string[])[] = [
  ["significance", "level"],
  ["confidence", "level"],
  ["significance", "threshold"],
  ["recurrence", "interval"],
  ["recurrence", "intervals"],
  ["return", "period"],
  ["critical", "value"],
  ["alpha"],
  ["threshold"],
  ["thresholds"],
];

/**
 * The value concepts the question actually asks about: every entry whose words
 * (allowing plural forms) appear in the question. A question about a
 * significance level cannot be hijacked by an unrelated recurrence-interval
 * statement, because that concept is not active for it.
 */
function activeValueConcepts(
  question: string,
  base: Set<string>
): readonly (readonly string[])[] {
  const text = question.toLowerCase();
  return VALUE_CONCEPTS.filter((words) =>
    words.every(
      (word) =>
        base.has(word) ||
        base.has(`${word}s`) ||
        new RegExp(`\\b${word}s?\\b`).test(text)
    )
  );
}

/**
 * Concept groups whose related terms become searchable when a question asks
 * about them. A group is "active" when the question literally uses one of its
 * terms; when active, every term in the group is matched too, so a document
 * that talks about "results and conclusions" is found by a question that asks
 * about "findings". Groups never activate off a synonym — the question itself
 * must use a group term — so expansion cannot derail an unrelated query.
 */
const CONCEPT_TERMS: Record<string, readonly string[]> = {
  methodology: [
    "methodology",
    "method",
    "methods",
    "approach",
    "approaches",
    "procedure",
    "procedures",
    "technique",
    "techniques",
    "protocol",
    "analysis",
    "analyses",
    "analyze",
    "analysed",
    "analyzing",
    "assessment",
    "evaluation",
    "experiment",
    "experiments",
    "simulation",
    "simulations",
    "modelled",
    "modelling",
    // Analysis-verb synonyms so a question that asks how trends were
    // "evaluated" also matches documents that say they were "assessed".
    "evaluated",
    "assessed",
  ],
  findings: [
    "findings",
    "finding",
    "results",
    "result",
    "conclusions",
    "conclusion",
    "outcomes",
    "outcome",
    "effects",
    "effect",
    "found",
    "observed",
    "revealed",
    "showed",
    "shown",
    "indicated",
    "demonstrated",
  ],
  temporal: [
    "temporal",
    "trend",
    "trends",
    "variation",
    "variations",
    "variability",
    "change",
    "changes",
    "seasonal",
    "annual",
    "interannual",
    "decadal",
    "increased",
    "decreased",
    "increases",
    "decreases",
  ],
  statistical: [
    "statistical",
    "statistically",
    "significance",
    "significant",
    "confidence",
    "correlation",
    "correlated",
    "regression",
    "hypothesis",
    // Paraphrase safety net: a question about a "significance level" should
    // also match documents that phrase the value as an "alpha level", a
    // "5% level" or a "confidence level".
    "level",
    "levels",
    "null",
    "alpha",
    "threshold",
    "thresholds",
  ],
  /**
   * Terms the paper itself uses to describe its own work, as opposed to the
   * prior studies it reviews. When a question asks what the authors did, a
   * passage carrying this self-referential voice ("we", "our", "the authors",
   * "this study") must outrank a literature review that merely cites other
   * work. Scored as its own evidence class, apart from concept expansion.
   */
  study: [
    "authors",
    "author",
    "we",
    "our",
    "study",
    "herein",
  ],
};

/**
 * Word-form families used to widen keyword matching to grammatical variants.
 * A question's keyword "statistical" must satisfy a document that says
 * "statistically", and "significance" must satisfy "significant", because a
 * strict exact-token match leaves real methodology sentences scoring zero.
 * Matching stays narrow and curated: only the words listed here share a
 * family, so a document word is never matched to an unrelated word that merely
 * shares a prefix. Words outside these families keep exact-match semantics.
 */
const WORD_FORMS: Record<string, readonly string[]> = {
  statistic: ["statistic", "statistics", "statistical", "statistically"],
  significant: ["significance", "significant", "significantly"],
  trend: ["trend", "trends"],
  level: ["level", "levels"],
  vary: ["variation", "variations", "vary", "varies", "varied"],
  change: ["change", "changes", "changed", "changing"],
  increase: ["increase", "increases", "increased", "increasing"],
  decrease: ["decrease", "decreases", "decreased", "decreasing"],
  analyse: [
    "analysis",
    "analyses",
    "analyse",
    "analysed",
    "analysing",
    "analyze",
    "analyzes",
    "analyzed",
    "analyzing",
  ],
  assess: ["assess", "assesses", "assessed", "assessing", "assessment"],
  evaluate: [
    "evaluate",
    "evaluates",
    "evaluated",
    "evaluating",
    "evaluation",
  ],
  method: [
    "method",
    "methods",
    "methodology",
    "methodologies",
    "methodological",
  ],
  correlate: [
    "correlate",
    "correlates",
    "correlated",
    "correlating",
    "correlation",
    "correlations",
  ],
  regress: ["regression", "regressions"],
  hypothes: ["hypothesis", "hypotheses"],
  threshold: ["threshold", "thresholds"],
  observe: [
    "observe",
    "observes",
    "observed",
    "observing",
    "observation",
    "observations",
  ],
};

/**
 * The word-boundary regex source that matches a keyword together with every
 * grammatical variant in its word-form family. Exact-match semantics when the
 * keyword has no family.
 */
export function wordFormSource(word: string): string {
  for (const forms of Object.values(WORD_FORMS)) {
    if (forms.includes(word)) {
      return `\\b(?:${forms.join("|")})\\b`;
    }
  }
  return `\\b${word}\\b`;
}

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

type KeywordHit = {
  index: number;
  keyword: string;
  kind: "base" | "study" | "expansion";
};

type Cluster = {
  start: number;
  end: number;
  score: number;
  distinctBase: number;
  distinctStudy: number;
  distinctExpansion: number;
  phraseCount: number;
  valueCount: number;
  conceptValue: number;
};

type Candidate = {
  item: ResearchContextItem;
  /** Combined body + metadata relevance score used for ordering. */
  score: number;
  /** The body passage that will be sent to the model for this item. */
  passage: string;
  /** Active question concepts covered by the passage and title. */
  covered: Set<string>;
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

/**
 * Returns the active concept groups for a question and the full set of terms
 * that become searchable for them. Study-group terms are kept apart from the
 * concept-expansion set: they identify the paper's own voice ("we", "our",
 * "the authors") rather than a topic synonym, so they are scored as their own
 * evidence class.
 */
function matchSetsOf(
  base: Set<string>
): {
  expansion: Set<string>;
  study: Set<string>;
  concepts: Set<string>;
} {
  const expansion = new Set<string>();
  const study = new Set<string>();
  const concepts = new Set<string>();
  for (const [concept, terms] of Object.entries(CONCEPT_TERMS)) {
    if (!terms.some((term) => base.has(term))) continue;
    concepts.add(concept);
    const target = concept === "study" ? study : expansion;
    for (const term of terms) target.add(term);
  }
  return { expansion, study, concepts };
}

/**
 * Reference metadata (title and identifying fields) used for both scoring and
 * the model-facing labels. Documents are identified by title + file name;
 * sources by title + publisher + url + hostname.
 */
function metadataHaystackOf(item: ResearchContextItem): string {
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

/**
 * Collapses source items that resolve to the same normalized URL, keeping the
 * first occurrence but preferring the copy that carries real body text (a
 * citable duplicate must never be dropped in favor of a metadata-only one).
 */
function dedupeSources(items: ResearchContextItem[]): ResearchContextItem[] {
  const byKey = new Map<string, ResearchContextItem>();
  for (const item of items) {
    const key = item.metadata.url
      ? normalizeUrl(item.metadata.url)
      : `item:${item.id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    if (existing.content.trim().length === 0 && item.content.trim().length > 0) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function truncate(content: string): string {
  return content.length > MAX_CONTENT_CHARS
    ? content.slice(0, MAX_CONTENT_CHARS)
    : content;
}

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
 * Word-boundary start indexes of every question keyword (base, study and
 * expansion) in the lowercased content, tagged with the keyword and its
 * evidence class. Keywords are already `[a-z0-9]+` tokens, so no escaping
 * is needed.
 */
function keywordHits(
  content: string,
  base: Set<string>,
  study: Set<string>,
  expansion: Set<string>
): KeywordHit[] {
  const haystack = content.toLowerCase();
  const hits: KeywordHit[] = [];
  for (const keyword of base) {
    const pattern = new RegExp(wordFormSource(keyword), "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(haystack)) !== null) {
      hits.push({ index: match.index, keyword, kind: "base" });
    }
  }
  for (const keyword of study) {
    if (base.has(keyword)) continue;
    const pattern = new RegExp(wordFormSource(keyword), "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(haystack)) !== null) {
      hits.push({ index: match.index, keyword, kind: "study" });
    }
  }
  for (const keyword of expansion) {
    if (base.has(keyword) || study.has(keyword)) continue;
    const pattern = new RegExp(wordFormSource(keyword), "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(haystack)) !== null) {
      hits.push({ index: match.index, keyword, kind: "expansion" });
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
 * A value notation that marks a sentence as carrying an actual value: a
 * decimal number ("0.05"), a percentage ("95%"), or a statistical comparison
 * such as "α = 0.05" or "p < 0.01". Four-digit integers (years, station
 * counts) are excluded because a decimal point, a percent sign or a
 * comparison marker is required. The lookbehind keeps a trailing "p" inside a
 * word ("step < 5") from passing as a p-value.
 */
const VALUE_NOTATION_PATTERN =
  /(?:\d+\.\d+|\d+\s*%|(?<![a-z])(?:p|alpha|α)\s*(?:=|≠|<|≤|>|≥)\s*\.?\d+)/i;

/**
 * True when the sentence containing `position` carries a value notation
 * anywhere within it.
 */
function sentenceHasValueNotation(content: string, position: number): boolean {
  const sentence = content.slice(
    sentenceStartIndex(content, position),
    sentenceEndIndex(content, position)
  );
  return VALUE_NOTATION_PATTERN.test(sentence);
}

/**
 * Word-boundary indexes of every occurrence of a value concept's terms within
 * `[from, to)`. Word-form aware, so "significant" counts for "significance"
 * and "levels" counts for "level".
 */
function conceptTermIndexes(
  content: string,
  conceptWords: readonly string[],
  from: number,
  to: number
): number[] {
  const start = Math.max(0, from);
  const end = Math.min(content.length, to);
  if (end <= start) return [];
  const haystack = content.slice(start, end);
  const indexes: number[] = [];
  for (const word of conceptWords) {
    const pattern = new RegExp(wordFormSource(word), "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(haystack)) !== null) {
      indexes.push(start + match.index);
    }
  }
  return indexes;
}

/**
 * The sentence bounds of the first value-bearing statement within `[from, to)`:
 * a sentence containing a term of an active value concept together with a value
 * notation anywhere in it. Real prose splits the concept phrase ("significant
 * at α = 0.05 level"), so the whole sentence is the unit of evidence rather
 * than a literal phrase sitting next to a number.
 */
function valueStatementSpan(
  content: string,
  valueConcepts: readonly (readonly string[])[],
  from: number,
  to: number
): { start: number; end: number } | null {
  for (const concept of valueConcepts) {
    for (const position of conceptTermIndexes(content, concept, from, to)) {
      if (!sentenceHasValueNotation(content, position)) continue;
      return {
        start: sentenceStartIndex(content, position),
        end: sentenceEndIndex(content, position),
      };
    }
  }
  return null;
}

/**
 * Returns the highest-scoring window of keyword hits (all hits within
 * `MAX_CONTENT_CHARS`). Windows are scored by the number of *distinct* question
 * keywords they cover — base keywords carrying full weight, self-referential
 * study evidence partial weight, concept-expanded terms less — plus bonuses
 * for exact multi-word phrase matches and, for value-seeking questions, for
 * distinct numeric tokens sitting next to a keyword hit (the hallmarks of an
 * actual definitional sentence). Counting raw hits instead lets a generic
 * passage that repeats one or two question words many times (e.g. "1-day, 1-yr
 * recurrence interval extreme rainfall events") beat the real methodology
 * sentence, so the score rewards coverage, not repetition.
 *
 * For value-seeking questions a further bonus rewards an active value concept
 * phrase ("significance level", "recurrence intervals", ...) appearing as a
 * phrase next to a number. This makes the methodological statement
 * "statistical significance level (a = 0.05)" outrank a passage that only has
 * "statistically significant ... 0.05" nearby, whose words never form the
 * concept phrase.
 */
function bestCluster(
  hits: KeywordHit[],
  phrases: string[][],
  content: string,
  valueSeeking: boolean,
  valueConcepts: readonly (readonly string[])[]
): { cluster: Cluster; valueCandidates: Cluster[] } {
  let bestStart = hits[0].index;
  let bestEnd = hits[0].index;
  let bestScore = -Infinity;
  let bestBase = 0;
  let bestStudy = 0;
  let bestExpansion = 0;
  let bestPhraseCount = 0;
  let bestValueCount = 0;
  let bestConceptValue = 0;
  let left = 0;
  const valueCandidates: Cluster[] = [];

  for (let right = 0; right < hits.length; right += 1) {
    while (hits[right].index - hits[left].index > MAX_CONTENT_CHARS) {
      left += 1;
    }

    const windowHits = hits.slice(left, right + 1);
    const windowStart = hits[left].index;
    const windowEnd = hits[right].index;
    const span = content.slice(
      windowStart,
      Math.min(content.length, windowEnd + VALUE_WINDOW)
    );

    let distinctBase = 0;
    let distinctStudy = 0;
    let distinctExpansion = 0;
    const baseSeen = new Set<string>();
    const studySeen = new Set<string>();
    const expansionSeen = new Set<string>();
    for (const hit of windowHits) {
      if (hit.kind === "base") {
        if (!baseSeen.has(hit.keyword)) {
          baseSeen.add(hit.keyword);
          distinctBase += 1;
        }
      } else if (hit.kind === "study") {
        if (!studySeen.has(hit.keyword)) {
          studySeen.add(hit.keyword);
          distinctStudy += 1;
        }
      } else if (!expansionSeen.has(hit.keyword)) {
        expansionSeen.add(hit.keyword);
        distinctExpansion += 1;
      }
    }

    let phraseCount = 0;
    for (const phrase of phrases) {
      const pattern = new RegExp(`\\b${phrase.join("\\s+")}\\b`, "i");
      if (pattern.test(span)) phraseCount += 1;
    }

    // For value-seeking questions, count the distinct numeric tokens that sit
    // within the window next to the question's value evidence. Years
    // (four-digit integers like "1961" in "1961-2009") are excluded so generic
    // passages full of dates and station counts are not rewarded merely for
    // containing numbers; a real value ("0.05", "95%", "1, 5 and 10 years") is.
    // Tokens are read from a slightly extended scan region so numbers at the
    // window boundary are seen whole, and a token that is actually a truncated
    // fragment of a longer number (e.g. "196" cut out of "1961") is rejected by
    // checking the characters that surround it in the original content.
    //
    // When the question names a value concept ("significance level",
    // "recurrence intervals", ...), a numeric token only counts when it sits
    // in a sentence that also carries a term of the concept. This keeps
    // number-dense results sections (thresholds, return values, station
    // counts) whose keywords merely sit among incidental numbers from
    // outranking the methodological statement that actually pairs the concept
    // with its value. The evidence unit is the whole sentence, because real
    // prose splits the concept phrase ("statistically significant at α = 0.05
    // level"); a literal phrase sitting next to a number is not required.
    // Questions without a value concept ("how many stations?", "which year?")
    // keep counting numbers near keyword hits.
    let valueCount = 0;
    let conceptValue = 0;
    if (valueSeeking) {
      const scanStart = Math.max(0, windowStart - VALUE_WINDOW);
      const scanEnd = Math.min(content.length, windowEnd + VALUE_WINDOW);
      if (valueConcepts.length === 0) {
        const valueSeen = new Set<string>();
        const valuePattern = /[0-9]+(?:\.[0-9]+)?/g;
        const scan = content.slice(scanStart, scanEnd);
        valuePattern.lastIndex = 0;
        let valueMatch: RegExpExecArray | null;
        while ((valueMatch = valuePattern.exec(scan)) !== null) {
          const token = valueMatch[0];
          if (/^\d{4}$/.test(token)) continue;
          const tokenIndex = scanStart + valueMatch.index;
          const prevChar = content.charAt(tokenIndex - 1);
          const nextChar = content.charAt(tokenIndex + token.length);
          if (/\d/.test(prevChar) || /\d/.test(nextChar)) continue;
          const nearHit = windowHits.some(
            (hit) => Math.abs(hit.index - tokenIndex) <= VALUE_WINDOW
          );
          if (nearHit) valueSeen.add(token);
        }
        valueCount = valueSeen.size;
      } else {
        const valueSeen = new Set<string>();
        const valuePattern = /[0-9]+(?:\.[0-9]+)?/g;
        for (const concept of valueConcepts) {
          let nearNumber = false;
          for (const position of conceptTermIndexes(
            content,
            concept,
            scanStart,
            scanEnd
          )) {
            if (!sentenceHasValueNotation(content, position)) continue;
            nearNumber = true;
            const sentence = content.slice(
              sentenceStartIndex(content, position),
              sentenceEndIndex(content, position)
            );
            valuePattern.lastIndex = 0;
            let valueMatch: RegExpExecArray | null;
            while ((valueMatch = valuePattern.exec(sentence)) !== null) {
              const token = valueMatch[0];
              if (/^\d{4}$/.test(token)) continue;
              valueSeen.add(token);
            }
          }
          if (nearNumber) conceptValue += 1;
        }
        valueCount = valueSeen.size;
      }
    }

    const score =
      distinctBase * 10 +
      distinctStudy * 8 +
      distinctExpansion * 2 +
      phraseCount * 20 +
      valueCount * 10 +
      conceptValue * 30;
    if (score > bestScore) {
      bestScore = score;
      bestStart = windowStart;
      bestEnd = windowEnd;
      bestBase = distinctBase;
      bestStudy = distinctStudy;
      bestExpansion = distinctExpansion;
      bestPhraseCount = phraseCount;
      bestValueCount = valueCount;
      bestConceptValue = conceptValue;
    }

    // Remember every value-bearing window so other regions that pair a value
    // concept with a number can be surfaced as complementary evidence. The
    // primary cluster is excluded later by span overlap.
    if (valueSeeking && conceptValue > 0) {
      valueCandidates.push({
        start: windowStart,
        end: windowEnd,
        score,
        distinctBase,
        distinctStudy,
        distinctExpansion,
        phraseCount,
        valueCount,
        conceptValue,
      });
    }
  }

  const cluster: Cluster = {
    start: bestStart,
    end: bestEnd,
    score: bestScore,
    distinctBase: bestBase,
    distinctStudy: bestStudy,
    distinctExpansion: bestExpansion,
    phraseCount: bestPhraseCount,
    valueCount: bestValueCount,
    conceptValue: bestConceptValue,
  };

  return {
    cluster,
    valueCandidates: collectValueCandidates(valueCandidates, cluster),
  };
}

/**
 * Orders the value-bearing windows by score and keeps the distinct regions,
 * dropping any that overlap the primary cluster's span or an already-kept
 * region. Windows slide continuously over a region, so this collapses each
 * region to its single best-scoring window. Bounded by `MAX_CONTEXT_ITEMS` so
 * a long document can never contribute a whole stack of candidates.
 */
function collectValueCandidates(
  candidates: Cluster[],
  primary: Cluster
): Cluster[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const kept: Cluster[] = [];
  for (const candidate of sorted) {
    if (spansOverlap(candidate, primary)) continue;
    if (kept.some((keptCandidate) => spansOverlap(candidate, keptCandidate)))
      continue;
    kept.push(candidate);
    if (kept.length >= MAX_CONTEXT_ITEMS) break;
  }
  return kept;
}

function spansOverlap(a: Cluster, b: Cluster): boolean {
  return a.start <= b.end && b.start <= a.end;
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
  base: Set<string>,
  study: Set<string>,
  expansion: Set<string>,
  phrases: string[][],
  valueSeeking: boolean,
  valueConcepts: readonly (readonly string[])[]
): string {
  if (content.length <= MAX_CONTENT_CHARS) {
    return content;
  }

  const hits = keywordHits(content, base, study, expansion);
  if (hits.length === 0) {
    return truncate(content);
  }

  const { cluster } = bestCluster(
    hits,
    phrases,
    content,
    valueSeeking,
    valueConcepts
  );
  return passageFromCluster(content, cluster, valueSeeking, valueConcepts);
}

/**
 * Builds the model-facing passage for a cluster: a bounded window anchored on
 * the sentence that carries the cluster's tail evidence, with a re-anchor onto
 * the value statement so a value-seeking passage can never lose the concept
 * phrase together with its number. Shared by the primary passage and every
 * secondary so all passages are built identically.
 */
function passageFromCluster(
  content: string,
  cluster: Cluster,
  valueSeeking: boolean,
  valueConcepts: readonly (readonly string[])[]
): string {
  const budget = MAX_CONTENT_CHARS;
  const clusterStart = cluster.start;
  const clusterEnd = cluster.end;

  // Anchor on the sentence containing the cluster's last hit. That hit can
  // land just before the continuation of an evidence-bearing statement (e.g. a
  // value word split by the PDF extractor), so the window must reach the end
  // of that sentence instead of stopping at the last matched keyword.
  const anchorStart = sentenceStartIndex(content, clusterEnd);
  const anchorEnd = sentenceEndIndex(content, clusterEnd);
  const requiredStart = Math.min(clusterStart, anchorStart);
  const requiredEnd = anchorEnd;
  const window = buildPassageWindow(
    content,
    requiredStart,
    requiredEnd,
    anchorStart,
    anchorEnd,
    budget
  );
  let from = window.from;
  let to = window.to;

  // Invariant for value-seeking questions that name a value concept: when the
  // winning cluster is itself a value-statement cluster (it scored a
  // conceptValue bonus), the final returned passage must carry the concept
  // phrase together with its number. Scoring happens on a window of keyword
  // hits, so the best-scoring cluster can still lose the statement to
  // sentence/word snapping; when that happens, re-anchor on the statement so
  // the score and the returned passage agree.
  if (
    valueSeeking &&
    valueConcepts.length > 0 &&
    cluster.conceptValue > 0 &&
    valueStatementSpan(content, valueConcepts, from, to) === null
  ) {
    const statement = valueStatementSpan(
      content,
      valueConcepts,
      0,
      content.length
    );
    if (statement !== null) {
      const stmtStart = sentenceStartIndex(content, statement.start);
      const stmtEnd = sentenceEndIndex(content, statement.end);
      const anchored = buildPassageWindow(
        content,
        statement.start,
        statement.end,
        stmtStart,
        stmtEnd,
        budget
      );
      from = anchored.from;
      to = anchored.to;
    }
  }

  return content.slice(from, to).trim();
}

/**
 * Builds a bounded passage window of at most `budget` characters around the
 * required span, centred, then aligned to sentence and word boundaries.
 * `fallbackStart`/`fallbackEnd` anchor the window when the required span
 * itself is wider than the budget. The start never advances past
 * `requiredStart` during sentence alignment, so the required evidence is never
 * traded away for continuation context.
 */
function buildPassageWindow(
  content: string,
  requiredStart: number,
  requiredEnd: number,
  fallbackStart: number,
  fallbackEnd: number,
  budget: number
): { from: number; to: number } {
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
    const span = fallbackEnd - fallbackStart;
    const head = Math.floor((budget - span) / 2);
    const tail = budget - span - head;
    from = Math.max(0, fallbackStart - head);
    to = Math.min(content.length, fallbackEnd + tail);
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
  // sentence terminator so the statement stays complete. When the window
  // already runs to the end of the document, nudge the start forward to the
  // next word instead of backward, because a backward snap shrinks the tail
  // budget and would cut a trailing value ("0.05)") off a value-bearing
  // statement that sits at the very end of the content.
  if (from > 0 && !/\s/.test(content[from - 1])) {
    if (to < content.length) {
      while (from > 0 && !/\s/.test(content[from - 1])) from -= 1;
    } else {
      while (from < to && !/\s/.test(content[from])) from += 1;
    }
  }
  if (to > from + budget) to = from + budget;
  // Snap the end back to a word boundary, but never strip a trailing value:
  // digits and closing punctuation that follow a number ("0.05)", "95%") are
  // part of the evidence and stay.
  while (
    to > from &&
    !/\s/.test(content[to - 1]) &&
    !/[0-9%)]/.test(content[to - 1]) &&
    !isSentenceTerminator(content, to - 1)
  ) {
    to -= 1;
  }

  return { from, to };
}

/**
 * The active concepts genuinely present in a text. Only the currently-active
 * question concepts are considered, so an unrelated synonym ("effect" in a
 * passage) never counts as coverage unless the question itself is about that
 * concept. A concept only counts as covered when at least two *distinct* terms
 * of it appear: a single stray synonym (e.g. one "observed" inside a methods
 * section) is not the findings content itself, so it must not mark the concept
 * as covered and block a complementary findings passage. Matching is
 * word-form aware, so "trend" in a title and "trends" in a passage are the
 * two distinct terms the original rule already counted.
 */
function coveredBy(text: string, concepts: Set<string>): Set<string> {
  const haystack = text.toLowerCase();
  const covered = new Set<string>();
  for (const concept of concepts) {
    const seen = new Set<string>();
    for (const term of CONCEPT_TERMS[concept]) {
      if (new RegExp(wordFormSource(term), "g").test(haystack)) seen.add(term);
    }
    if (seen.size >= 2) covered.add(concept);
  }
  return covered;
}

/**
 * Scores a single context item: a body score from the best keyword cluster in
 * its content plus a metadata score from its title and identifying fields.
 * The item's model-facing passage is selected alongside so that coverage can
 * be measured against exactly what the model will see.
 */
function rankCandidate(
  item: ResearchContextItem,
  base: Set<string>,
  study: Set<string>,
  expansion: Set<string>,
  phrases: string[][],
  concepts: Set<string>,
  valueSeeking: boolean,
  valueConcepts: readonly (readonly string[])[]
): Candidate {
  const body = item.content;
  let bodyScore = 0;
  let passage = body;
  if (body.trim().length > 0) {
    const hits = keywordHits(body, base, study, expansion);
    if (hits.length > 0) {
      bodyScore = bestCluster(hits, phrases, body, valueSeeking, valueConcepts)
        .cluster.score;
      if (body.length > MAX_CONTENT_CHARS) {
        passage = selectRelevantPassage(
          body,
          base,
          study,
          expansion,
          phrases,
          valueSeeking,
          valueConcepts
        );
      }
    } else if (body.length > MAX_CONTENT_CHARS) {
      passage = truncate(body);
    }
  }

  const metadata = metadataHaystackOf(item).toLowerCase();
  let metadataScore = 0;
  for (const keyword of base) {
    if (metadata.includes(keyword)) metadataScore += 5;
  }
  for (const keyword of expansion) {
    if (!base.has(keyword) && metadata.includes(keyword)) metadataScore += 2;
  }
  for (const phrase of phrases) {
    const pattern = new RegExp(`\\b${phrase.join("\\s+")}\\b`, "i");
    if (pattern.test(metadata)) metadataScore += 8;
  }

  const covered =
    concepts.size > 0
      ? coveredBy(`${item.title} ${passage}`, concepts)
      : new Set<string>();

  return {
    item,
    score: bodyScore + metadataScore,
    passage,
    covered,
  };
}

/**
 * Selects the context items, greedily preferring candidates that cover the
 * most still-uncovered question concepts so the model receives complementary
 * evidence instead of several items about the same idea. When every concept
 * is already covered (or the question has no active concepts), picks the
 * highest-scored candidates in order, so top relevance always wins ties.
 */
function greedyDiverse(
  candidates: Candidate[],
  concepts: Set<string>
): Candidate[] {
  const selected: Candidate[] = [];
  const remaining = [...candidates];
  const uncovered = new Set(concepts);

  while (selected.length < MAX_CONTEXT_ITEMS && remaining.length > 0) {
    let bestIndex = 0;
    let bestGain = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      let gain = 0;
      for (const concept of remaining[i].covered) {
        if (uncovered.has(concept)) gain += 1;
      }
      if (gain > bestGain) {
        bestGain = gain;
        bestIndex = i;
      }
    }
    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    for (const concept of chosen.covered) uncovered.delete(concept);
  }

  return selected;
}

/**
 * Appends secondary passages for still-uncovered concepts. A single long
 * document can answer a multi-concept question across different sections, but
 * its best cluster captures only one region; each still-uncovered concept is
 * then targeted independently with its own focus terms, so a findings/results
 * section thousands of characters away from the methodology section is still
 * contributed as an additional context item (same document id, different
 * region, independently citable). Concepts a secondary passage happens to
 * cover are removed from the still-uncovered set, so only genuinely new
 * coverage adds another item. Passages are only added when the focus
 * genuinely appears in the body with at least two distinct concept terms, when
 * they are not already part of the text the model was given for that document,
 * and within the existing item budget.
 */
function addSecondaryPassages(
  selected: Candidate[],
  candidates: Candidate[],
  concepts: Set<string>
): Candidate[] {
  if (concepts.size === 0 || selected.length >= MAX_CONTEXT_ITEMS) {
    return selected;
  }

  const uncovered = new Set(concepts);
  for (const candidate of selected) {
    for (const concept of candidate.covered) uncovered.delete(concept);
  }
  if (uncovered.size === 0) return selected;

  const result = [...selected];
  const capacity = MAX_CONTEXT_ITEMS - result.length;
  let added = 0;

  for (const concept of [...uncovered]) {
    if (!uncovered.has(concept)) continue;
    if (added >= capacity) break;

    for (const candidate of candidates) {
      if (candidate.item.kind !== "document") continue;
      const alreadyIncluded = result
        .filter((existing) => existing.item.id === candidate.item.id)
        .map((existing) => existing.passage);
      const focused = focusedConceptPassage(
        { title: candidate.item.title, content: candidate.item.content },
        concept,
        alreadyIncluded
      );
      if (focused === null) continue;

      const covered = coveredBy(
        `${candidate.item.title} ${focused}`,
        uncovered
      );
      result.push({
        ...candidate,
        item: { ...candidate.item, content: focused },
        passage: focused,
        covered,
      });
      added += 1;
      for (const coveredConcept of covered) uncovered.delete(coveredConcept);
      break;
    }
  }

  return result;
}

/**
 * The parsed view of a question that drives passage selection: its base
 * keywords, multi-word phrases, value-seeking flag, active value concepts and
 * the expanded concept groups. Computed once per question and shared by every
 * passage selection for it, so the answer path (`retrieveResearchContext`) and
 * the relevance gate (`selectRelevantPassages`) can never drift apart.
 */
export type QuestionAnalysis = {
  base: Set<string>;
  phrases: string[][];
  valueSeeking: boolean;
  valueConcepts: readonly (readonly string[])[];
  expansion: Set<string>;
  study: Set<string>;
  concepts: Set<string>;
};

/**
 * Parses a question into the analysis view used by all passage selection. This
 * is the single entry point for the scoring pipeline: base keywords, multi-word
 * phrases, value-seeking detection, the active value concepts and the expanded
 * concept groups all come from here.
 */
export function analyzeQuestion(question: string): QuestionAnalysis {
  const base = keywordsOf(question);
  const phrases = phrasesOf(question, base);
  const valueSeeking = isValueSeeking(question);
  const valueConcepts = activeValueConcepts(question, base);
  const { expansion, study, concepts } = matchSetsOf(base);
  return {
    base,
    phrases,
    valueSeeking,
    valueConcepts,
    expansion,
    study,
    concepts,
  };
}

/**
 * A distinct passage of a document that specifically targets a single
 * still-uncovered question concept, or null when the document has no dedicated
 * region for that concept. The concept must genuinely appear in the body with
 * at least two distinct terms (a stray synonym is not content) and the focused
 * passage must not already be part of the text given for the document. Shared
 * by the answer path (`addSecondaryPassages`) and the relevance gate
 * (`selectRelevantPassages`) so a multi-section document contributes
 * complementary evidence to both.
 */
function focusedConceptPassage(
  document: { title: string; content: string },
  concept: string,
  alreadyIncluded: string[]
): string | null {
  const { title, content } = document;
  if (content.trim().length === 0 || content.length <= MAX_CONTENT_CHARS) {
    return null;
  }
  const focus = new Set(CONCEPT_TERMS[concept]);
  if (
    keywordHits(content, focus, new Set<string>(), new Set<string>()).length ===
    0
  ) {
    return null;
  }
  const focused = selectRelevantPassage(
    content,
    focus,
    new Set<string>(),
    new Set<string>(),
    [],
    false,
    []
  );
  if (focused.length === 0) return null;
  if (!coveredBy(`${title} ${focused}`, new Set([concept])).has(concept)) {
    return null;
  }
  if (alreadyIncluded.some((existing) => existing.includes(focused))) {
    return null;
  }
  return focused;
}

/**
 * Selects the model-facing passages of a single document for a question: the
 * primary passage (the best-scoring cluster region, or the whole body when it
 * is short), the other value-bearing regions within a margin of the primary
 * for value-seeking questions, plus one focused secondary passage per
 * still-uncovered question concept, when the document carries that content in
 * a separate region. Bounded at `MAX_CONTEXT_ITEMS` passages. This is what
 * the relevance gate feeds the classifier instead of a fixed leading excerpt,
 * so an answer sitting past the intro is still seen.
 */
export function selectRelevantPassages(
  question: string,
  document: { title: string; content: string }
): string[] {
  const { content } = document;
  if (content.trim().length === 0) {
    return [];
  }

  const {
    base,
    phrases,
    valueSeeking,
    valueConcepts,
    expansion,
    study,
    concepts,
  } = analyzeQuestion(question);

  if (content.length <= MAX_CONTENT_CHARS) {
    return [content];
  }

  const hits = keywordHits(content, base, study, expansion);
  if (hits.length === 0) {
    return [truncate(content)];
  }

  const { cluster, valueCandidates } = bestCluster(
    hits,
    phrases,
    content,
    valueSeeking,
    valueConcepts
  );
  const passages: string[] = [];
  const addPassage = (passage: string): boolean => {
    if (
      passage.length === 0 ||
      passages.length >= MAX_CONTEXT_ITEMS ||
      passages.some(
        (existing) => existing.includes(passage) || passage.includes(existing)
      )
    ) {
      return false;
    }
    passages.push(passage);
    return true;
  };

  addPassage(passageFromCluster(content, cluster, valueSeeking, valueConcepts));

  // Value-redundancy secondaries: when the question targets a value concept,
  // every other value-bearing region that scores within a margin of the
  // primary is surfaced as additional evidence, even when the primary already
  // covers every concept. A literal phrase bonus can otherwise crown a single
  // passage (e.g. the methods sentence "statistical significance level
  // (a = 0.05)") and silently suppress the results sections that actually
  // state the finding at the same level.
  if (valueSeeking && valueConcepts.length > 0) {
    for (const candidate of valueCandidates) {
      if (candidate.score < cluster.score * VALUE_CANDIDATE_SCORE_RATIO) {
        continue;
      }
      addPassage(
        passageFromCluster(content, candidate, valueSeeking, valueConcepts)
      );
    }
  }

  const covered = coveredBy(
    `${document.title} ${passages.join(" ")}`,
    concepts
  );
  const uncovered = new Set(concepts);
  for (const concept of covered) uncovered.delete(concept);

  for (const concept of [...uncovered]) {
    if (!uncovered.has(concept)) continue;
    const focused = focusedConceptPassage(document, concept, passages);
    if (focused === null) continue;
    addPassage(focused);
    const newlyCovered = coveredBy(`${document.title} ${focused}`, uncovered);
    for (const coveredConcept of newlyCovered) {
      uncovered.delete(coveredConcept);
    }
  }

  return passages;
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

  const {
    base,
    phrases,
    valueSeeking,
    valueConcepts,
    expansion,
    study,
    concepts,
  } = analyzeQuestion(question);

  const documentItems = documentsResult.data
    .filter((document) => document.status === "ready")
    .map(toItem);
  const sourceItems = dedupeSources(sourcesResult.data.map(toSourceItem));

  const candidates = [...documentItems, ...sourceItems]
    .map((item) =>
      rankCandidate(
        item,
        base,
        study,
        expansion,
        phrases,
        concepts,
        valueSeeking,
        valueConcepts
      )
    )
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.title.localeCompare(b.item.title);
    });

  const primary = greedyDiverse(candidates, concepts);
  const selected = addSecondaryPassages(primary, candidates, concepts);

  const items = selected.map((candidate) => ({
    ...candidate.item,
    content: candidate.passage,
  }));

  return ok({
    items,
    hasBodyContent: items.some((item) => item.content.trim().length > 0),
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
