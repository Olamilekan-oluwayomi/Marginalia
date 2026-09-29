import type { CreateSourceInput, SourceRow, Supabase } from "./types";
import {
  fail,
  notFound,
  ok,
  toAppError,
  validationError,
  type AppResult,
} from "./errors";
import { normalizeUrl } from "@/lib/search/normalize-url";
import { requireUser } from "./session";
import {
  optionalDate,
  optionalText,
  requireText,
  requireUuid,
} from "./validation";

const TITLE_MAX_LENGTH = 300;
const URL_MAX_LENGTH = 500;
const PUBLISHER_MAX_LENGTH = 200;
const CONTENT_MAX_LENGTH = 200_000;

function validateCreateInput(input: CreateSourceInput): string | null {
  const titleError = requireText(input.title, "Title", TITLE_MAX_LENGTH);
  if (titleError) {
    return titleError.message;
  }
  const urlError = optionalText(input.url, "URL", URL_MAX_LENGTH);
  if (urlError) {
    return urlError.message;
  }
  const publisherError = optionalText(
    input.publisher,
    "Publisher",
    PUBLISHER_MAX_LENGTH,
  );
  if (publisherError) {
    return publisherError.message;
  }
  const dateError = optionalDate(input.retrieved_at, "Retrieved at");
  if (dateError) {
    return dateError.message;
  }
  const contentError = optionalText(
    input.content,
    "Content",
    CONTENT_MAX_LENGTH,
  );
  if (contentError) {
    return contentError.message;
  }
  return null;
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Resolves whether a source with an equivalent URL already exists. Two URLs
 * are equivalent when they normalize to the same canonical key (host casing,
 * trailing slashes, fragments and tracking parameters are ignored). Only
 * well-formed http(s) URLs are deduplicated so a non-URL text value can never
 * be merged with a real URL.
 */
function findDuplicateUrl(
  existing: Pick<SourceRow, "url">[],
  url: string,
): boolean {
  if (!isWebUrl(url)) {
    return false;
  }
  const canonical = normalizeUrl(url);
  return existing.some((source) => {
    if (!source.url) {
      return false;
    }
    return isWebUrl(source.url) && normalizeUrl(source.url) === canonical;
  });
}

export async function getSources(
  supabase: Supabase,
  researchId: string,
): Promise<AppResult<SourceRow[]>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), []);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, []);
  }

  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("research_id", researchId)
    .order("created_at", { ascending: true });

  if (error) {
    return fail(toAppError(error), []);
  }

  return ok(data ?? []);
}

export async function createSource(
  supabase: Supabase,
  researchId: string,
  input: CreateSourceInput,
): Promise<AppResult<SourceRow | null>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const validationMessage = validateCreateInput(input);
  if (validationMessage) {
    return fail(validationError(validationMessage), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  // Reject sources that duplicate an existing one in the same research
  // *before* inserting. Web research already dedupes by canonical URL; this
  // extends the same rule to manually added sources so the evidence list
  // never holds two entries for the same page.
  if (input.url) {
    const existingResult = await getSources(supabase, researchId);
    if (existingResult.error) {
      return fail(existingResult.error, null);
    }
    if (findDuplicateUrl(existingResult.data, input.url.trim())) {
      return fail(
        validationError("A source with this URL is already in this research."),
        null,
      );
    }
  }

  const { data, error } = await supabase
    .from("sources")
    .insert({
      research_id: researchId,
      user_id: session.user.id,
      title: input.title.trim(),
      url: input.url?.trim() || null,
      publisher: input.publisher?.trim() || null,
      retrieved_at: input.retrieved_at || null,
      content: input.content?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    return fail(toAppError(error), null);
  }

  return ok(data);
}

/**
 * Fetches a single source by id. Ownership is enforced by RLS, so a caller
 * can never reach another user's source; a non-owned id resolves to
 * NOT_FOUND.
 */
export async function getSourceById(
  supabase: Supabase,
  sourceId: string,
): Promise<AppResult<SourceRow | null>> {
  const idError = requireUuid(sourceId, "Source id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Source not found."), null);
  }

  return ok(data);
}

export async function deleteSource(
  supabase: Supabase,
  sourceId: string,
): Promise<AppResult<null>> {
  const idError = requireUuid(sourceId, "Source id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("sources")
    .delete()
    .eq("id", sourceId)
    .select("id")
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Source not found."), null);
  }

  return ok(null);
}
