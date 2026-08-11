import type { CreateSourceInput, SourceRow, Supabase } from "./types";
import {
  fail,
  notFound,
  ok,
  toAppError,
  validationError,
  type AppResult,
} from "./errors";
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
    PUBLISHER_MAX_LENGTH
  );
  if (publisherError) {
    return publisherError.message;
  }
  const dateError = optionalDate(input.retrieved_at, "Retrieved at");
  if (dateError) {
    return dateError.message;
  }
  return null;
}

export async function getSources(
  supabase: Supabase,
  researchId: string
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
  input: CreateSourceInput
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

  const { data, error } = await supabase
    .from("sources")
    .insert({
      research_id: researchId,
      user_id: session.user.id,
      title: input.title.trim(),
      url: input.url?.trim() || null,
      publisher: input.publisher?.trim() || null,
      retrieved_at: input.retrieved_at || null,
    })
    .select("*")
    .single();

  if (error) {
    return fail(toAppError(error), null);
  }

  return ok(data);
}

export async function deleteSource(
  supabase: Supabase,
  sourceId: string
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
