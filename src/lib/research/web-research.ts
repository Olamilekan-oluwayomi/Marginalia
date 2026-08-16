import "server-only";

import { searchWeb, type WebSearchResult } from "@/lib/search";
import { normalizeUrl } from "@/lib/search/normalize-url";
import { appError, describeError, fail, ok, validationError, type AppResult } from "./errors";
import { requireUser } from "./session";
import { createSource, getSources } from "./sources";
import type { ResearchContextItem } from "./context";
import type { Supabase } from "./types";
import { requireUuid } from "./validation";

/** Display label used on sources saved from web research. */
export const WEB_SOURCE_PUBLISHER = "Web search";

/** Upper bound on new sources persisted from a single search. */
const MAX_NEW_SOURCES = 5;

/**
 * Upper bound on a saved source title; `createSource` enforces the same cap.
 */
const TITLE_MAX_LENGTH = 300;

export type RunWebResearchResult = {
  /**
   * Metadata-only context items for the sources discovered by web research.
   * They carry no body text, so they are reference metadata only — never
   * citable by the citation protocol.
   */
  items: ResearchContextItem[];
  /** Number of new source rows persisted for this research. */
  addedCount: number;
};

/**
 * Runs opt-in web research for a question and records the results.
 *
 * The discovered results are validated (well-formed http(s) URLs supplied by
 * the search provider — never invented by the model) and persisted as
 * metadata-only `sources` rows in the research, deduplicated by URL against
 * the sources already present. Persisting them makes the found references
 * visible in the workspace and reusable on later questions; the user can paste
 * body text into them later to make them citable.
 *
 * Web research is best-effort and never fails the surrounding answer's
 * routing, but a real search failure is never converted into a silent empty
 * success: provider/configuration failures surface as a `fail` result whose
 * cause is logged via `describeError`, so "search failed" is distinguishable
 * from "search returned nothing" (which resolves to an empty payload).
 * Ownership is enforced by the RLS-scoped data layer and the session check
 * here.
 */
export async function runWebResearch(
  supabase: Supabase,
  researchId: string,
  question: string
): Promise<AppResult<RunWebResearchResult>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(
      validationError(idError.message),
      { items: [], addedCount: 0 }
    );
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, { items: [], addedCount: 0 });
  }

  console.log("[research] webSearch:start");

  const sourcesResult = await getSources(supabase, researchId);
  if (sourcesResult.error) {
    return fail(sourcesResult.error, { items: [], addedCount: 0 });
  }

  const existingUrls = new Set(
    sourcesResult.data
      .map((source) => source.url)
      .filter((url): url is string => Boolean(url))
      .map(normalizeUrl)
  );

  let results: WebSearchResult[];
  try {
    results = await searchWeb(question);
  } catch (error) {
    // A search failure must not be converted into a silent empty result: it is
    // logged with its full underlying cause so a quota, auth, timeout, or
    // grounding failure is distinguishable from "the provider returned
    // nothing", and it surfaces as an error the caller can react to.
    console.error("[research] webSearch:provider_failure", describeError(error));
    return fail(
      appError("DATABASE_ERROR", "Web search could not be completed."),
      { items: [], addedCount: 0 }
    );
  }

  if (results.length === 0) {
    console.log("[research] webSearch:provider_empty");
    return ok({ items: [], addedCount: 0 });
  }
  console.log(`[research] webSearch:provider_success results=${results.length}`);

  const items: ResearchContextItem[] = [];
  let addedCount = 0;

  for (const result of results) {
    if (existingUrls.has(normalizeUrl(result.url))) continue;
    existingUrls.add(normalizeUrl(result.url));

    const created = await createSource(supabase, researchId, {
      title: result.title.slice(0, TITLE_MAX_LENGTH),
      url: result.url,
      publisher: WEB_SOURCE_PUBLISHER,
      retrieved_at: new Date().toISOString(),
    });

    if (created.error || !created.data) {
      // Skip a single failed insert; keep the remaining results. Log it so a
      // source persistence failure (e.g. RLS or a schema gap) is not silently
      // mistaken for "web search returned nothing".
      console.error(
        "[research] webSearch:source_insert_failure",
        created.error?.message ?? "missing source row"
      );
      continue;
    }

    addedCount += 1;
    items.push({
      kind: "source",
      id: created.data.id,
      title: created.data.title,
      content: "",
      metadata: {
        publisher: created.data.publisher ?? undefined,
        url: created.data.url ?? undefined,
      },
    });

    if (addedCount >= MAX_NEW_SOURCES) break;
  }

  console.log(`[research] webSearch:source_insert_success count=${addedCount}`);
  return ok({ items, addedCount });
}
