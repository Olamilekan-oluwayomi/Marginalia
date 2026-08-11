import type {
  AnswerStatus,
  CreateQuestionInput,
  ResearchQuestionRow,
  Supabase,
} from "./types";
import {
  ANSWER_STATUSES,
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

const QUESTION_MAX_LENGTH = 1000;

export async function getQuestions(
  supabase: Supabase,
  researchId: string
): Promise<AppResult<ResearchQuestionRow[]>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), []);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, []);
  }

  const { data, error } = await supabase
    .from("research_questions")
    .select("*")
    .eq("research_id", researchId)
    .order("created_at", { ascending: true });

  if (error) {
    return fail(toAppError(error), []);
  }

  return ok(data ?? []);
}

export async function getQuestionById(
  supabase: Supabase,
  questionId: string
): Promise<AppResult<ResearchQuestionRow | null>> {
  const idError = requireUuid(questionId, "Question id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("research_questions")
    .select("*")
    .eq("id", questionId)
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Question not found."), null);
  }

  return ok(data);
}

export async function createQuestion(
  supabase: Supabase,
  researchId: string,
  input: CreateQuestionInput
): Promise<AppResult<ResearchQuestionRow | null>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const questionError = requireText(
    input.question,
    "Question",
    QUESTION_MAX_LENGTH
  );
  if (questionError) {
    return fail(validationError(questionError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("research_questions")
    .insert({
      research_id: researchId,
      user_id: session.user.id,
      question: input.question.trim(),
    })
    .select("*")
    .single();

  if (error) {
    return fail(toAppError(error), null);
  }

  return ok(data);
}

export async function updateQuestionStatus(
  supabase: Supabase,
  questionId: string,
  status: AnswerStatus
): Promise<AppResult<ResearchQuestionRow | null>> {
  const idError = requireUuid(questionId, "Question id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const statusError = requireOneOf(
    status,
    ANSWER_STATUSES,
    "Status"
  );
  if (statusError) {
    return fail(validationError(statusError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("research_questions")
    .update({ answer_status: status })
    .eq("id", questionId)
    .select("*")
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Question not found."), null);
  }

  return ok(data);
}

export async function deleteQuestion(
  supabase: Supabase,
  questionId: string
): Promise<AppResult<null>> {
  const idError = requireUuid(questionId, "Question id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("research_questions")
    .delete()
    .eq("id", questionId)
    .select("id")
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Question not found."), null);
  }

  return ok(null);
}
