import type { CitationRow, CreateCitationInput, Supabase } from "./types";
import {
  fail,
  ok,
  toAppError,
  validationError,
  type AppResult,
} from "./errors";
import { requireUser } from "./session";
import {
  exactlyOneProvided,
  optionalText,
  requireNumber,
  requireUuid,
} from "./validation";

const EXCERPT_MAX_LENGTH = 2_000;

function validateCreateInput(input: CreateCitationInput): string | null {
  const citationError = requireNumber(
    input.citation_number,
    "Citation number",
    { min: 1 }
  );
  if (citationError) {
    return citationError.message;
  }

  const linkError = exactlyOneProvided([
    { name: "document_id", value: input.document_id },
    { name: "source_id", value: input.source_id },
  ]);
  if (linkError) {
    return linkError.message;
  }

  if (input.document_id !== undefined) {
    const idError = requireUuid(input.document_id, "Document id");
    if (idError) {
      return idError.message;
    }
  }
  if (input.source_id !== undefined) {
    const idError = requireUuid(input.source_id, "Source id");
    if (idError) {
      return idError.message;
    }
  }

  const excerptError = optionalText(input.excerpt, "Excerpt", EXCERPT_MAX_LENGTH);
  if (excerptError) {
    return excerptError.message;
  }

  return null;
}

export async function getCitations(
  supabase: Supabase,
  answerId: string
): Promise<AppResult<CitationRow[]>> {
  const idError = requireUuid(answerId, "Answer id");
  if (idError) {
    return fail(validationError(idError.message), []);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, []);
  }

  const { data, error } = await supabase
    .from("citations")
    .select("*")
    .eq("answer_id", answerId)
    .order("citation_number", { ascending: true });

  if (error) {
    return fail(toAppError(error), []);
  }

  return ok(data ?? []);
}

export async function createCitation(
  supabase: Supabase,
  answerId: string,
  input: CreateCitationInput
): Promise<AppResult<CitationRow | null>> {
  const answerIdError = requireUuid(answerId, "Answer id");
  if (answerIdError) {
    return fail(validationError(answerIdError.message), null);
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
    .from("citations")
    .insert({
      answer_id: answerId,
      document_id: input.document_id ?? null,
      source_id: input.source_id ?? null,
      citation_number: input.citation_number,
      excerpt: input.excerpt?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    return fail(toAppError(error), null);
  }

  return ok(data);
}
