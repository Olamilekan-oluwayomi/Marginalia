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

/**
 * Counts questions the current user asked across all of their research
 * workspaces within the last `windowMinutes` minutes. Used by the question
 * action as a light application-level rate limit so a burst of questions
 * cannot drain provider budget. RLS-scoped (the `research_questions` rows are
 * the user's own) and additionally filtered by the authenticated user id, so
 * the cap is global per user rather than per research — a user cannot bypass
 * it by spreading questions across many workspaces.
 */
export async function getRecentUserQuestionCount(
  supabase: Supabase,
  windowMinutes: number
): Promise<AppResult<number>> {
  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, 0);
  }

  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const { count, error } = await supabase
    .from("research_questions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.user.id)
    .gte("created_at", since);

  if (error) {
    return fail(toAppError(error), 0);
  }

  return ok(count ?? 0);
}

export async function getQuestionById(
  supabase: Supabase,
  questionId: string
): Promise<AppResult<ResearchQuestionRow | null>> {  const idError = requireUuid(questionId, "Question id");
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
      include_web: input.includeWeb ?? false,
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

/**
 * Atomically moves a question from one of the allowed `from` statuses into
 * `to`. The UPDATE is guarded by the current `answer_status`, so two
 * concurrent callers cannot both win: PostgREST applies the WHERE clause
 * against the latest committed row, so only the first writer matches and the
 * second updates zero rows. This is what prevents duplicate generations of
 * the same question through the UI/action path.
 */
export async function tryTransitionQuestionStatus(
  supabase: Supabase,
  questionId: string,
  from: readonly AnswerStatus[],
  to: AnswerStatus
): Promise<AppResult<{ transitioned: boolean }>> {
  const idError = requireUuid(questionId, "Question id");
  if (idError) {
    return fail(validationError(idError.message), { transitioned: false });
  }

  if (
    from.length === 0 ||
    from.some((status) => !ANSWER_STATUSES.includes(status))
  ) {
    return fail(validationError("Status is invalid."), { transitioned: false });
  }
  const toError = requireOneOf(to, ANSWER_STATUSES, "Status");
  if (toError) {
    return fail(validationError(toError.message), { transitioned: false });
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, { transitioned: false });
  }

  const { data, error } = await supabase
    .from("research_questions")
    .update({ answer_status: to })
    .eq("id", questionId)
    .in("answer_status", from)
    .select("id")
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), { transitioned: false });
  }

  return ok({ transitioned: Boolean(data) });
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
