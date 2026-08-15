import type {
  AnswerRow,
  AnswerWithCitations,
  CreateAnswerInput,
  Supabase,
} from "./types";
import {
  fail,
  notFound,
  ok,
  toAppError,
  validationError,
  type AppResult,
} from "./errors";
import { requireUser } from "./session";
import { requireOneOf, requireText, requireUuid } from "./validation";

const CONTENT_MAX_LENGTH = 100_000;
const MODEL_MAX_LENGTH = 100;

export async function getAnswers(
  supabase: Supabase,
  questionId: string
): Promise<AppResult<AnswerRow[]>> {
  const idError = requireUuid(questionId, "Question id");
  if (idError) {
    return fail(validationError(idError.message), []);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, []);
  }

  const { data, error } = await supabase
    .from("answers")
    .select("*")
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });

  if (error) {
    return fail(toAppError(error), []);
  }

  return ok(data ?? []);
}

/**
 * Returns a single answer with its citations attached. Used when rendering a
 * completed answer on the research workspace.
 */
export async function getAnswerWithCitations(
  supabase: Supabase,
  answerId: string
): Promise<AppResult<AnswerWithCitations | null>> {
  const idError = requireUuid(answerId, "Answer id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("answers")
    .select("*, citations(*)")
    .eq("id", answerId)
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Answer not found."), null);
  }

  return ok(data as AnswerWithCitations);
}

export async function createAnswer(
  supabase: Supabase,
  questionId: string,
  researchId: string,
  input: CreateAnswerInput
): Promise<AppResult<AnswerRow | null>> {
  const idError = requireUuid(questionId, "Question id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }
  const researchIdError = requireUuid(researchId, "Research id");
  if (researchIdError) {
    return fail(validationError(researchIdError.message), null);
  }

  const contentError = requireText(input.content, "Content", CONTENT_MAX_LENGTH);
  if (contentError) {
    return fail(validationError(contentError.message), null);
  }
  const modelError = requireText(input.model ?? "ai", "Model", MODEL_MAX_LENGTH);
  if (modelError) {
    return fail(validationError(modelError.message), null);
  }
  if (input.source_mode !== undefined && input.source_mode !== null) {
    const sourceModeError = requireOneOf(
      input.source_mode,
      ["document", "web", "both"] as const,
      "Source mode"
    );
    if (sourceModeError) {
      return fail(validationError(sourceModeError.message), null);
    }
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("answers")
    .insert({
      question_id: questionId,
      research_id: researchId,
      content: input.content.trim(),
      model: input.model?.trim() || null,
      fallback_reason: input.fallback_reason?.trim() || null,
      source_mode: input.source_mode ?? "document",
    })
    .select("*")
    .single();

  if (error) {
    return fail(toAppError(error), null);
  }

  return ok(data);
}

export async function deleteAnswer(
  supabase: Supabase,
  answerId: string
): Promise<AppResult<null>> {
  const idError = requireUuid(answerId, "Answer id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("answers")
    .delete()
    .eq("id", answerId)
    .select("id")
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Answer not found."), null);
  }

  return ok(null);
}
