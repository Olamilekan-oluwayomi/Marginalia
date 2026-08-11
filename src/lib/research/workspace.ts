import type {
  AnswerWithCitations,
  QuestionWithAnswers,
  ResearchWorkspace,
  Supabase,
} from "./types";
import { fail, notFound, ok, toAppError, validationError, type AppResult } from "./errors";
import { requireUser } from "./session";
import { requireUuid } from "./validation";

/**
 * Loads everything needed to render a research workspace in one pass:
 * the research record, its questions (each with the latest answers and their
 * citations), documents and sources.
 */
export async function getResearchWorkspace(
  supabase: Supabase,
  researchId: string
): Promise<AppResult<ResearchWorkspace | null>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const [researchRes, questionsRes, answersRes, documentsRes, sourcesRes] =
    await Promise.all([
      supabase
        .from("research")
        .select("*")
        .eq("id", researchId)
        .maybeSingle(),
      supabase
        .from("research_questions")
        .select("*")
        .eq("research_id", researchId)
        .order("created_at", { ascending: true }),
      supabase
        .from("answers")
        .select("*, citations(*)")
        .eq("research_id", researchId)
        .order("created_at", { ascending: true }),
      supabase
        .from("documents")
        .select("*")
        .eq("research_id", researchId)
        .order("created_at", { ascending: true }),
      supabase
        .from("sources")
        .select("*")
        .eq("research_id", researchId)
        .order("created_at", { ascending: true }),
    ]);

  if (researchRes.error) {
    return fail(toAppError(researchRes.error), null);
  }
  if (!researchRes.data) {
    return fail(notFound("Research not found."), null);
  }

  for (const result of [questionsRes, answersRes, documentsRes, sourcesRes]) {
    if (result.error) {
      return fail(toAppError(result.error), null);
    }
  }

  const answersByQuestion = new Map<string, AnswerWithCitations[]>();
  for (const answer of (answersRes.data ?? []) as AnswerWithCitations[]) {
    const list = answersByQuestion.get(answer.question_id) ?? [];
    list.push(answer);
    answersByQuestion.set(answer.question_id, list);
  }

  const questions: QuestionWithAnswers[] = (questionsRes.data ?? []).map(
    (question) => ({
      ...question,
      answers: answersByQuestion.get(question.id) ?? [],
    })
  );

  return ok({
    research: researchRes.data,
    questions,
    documents: documentsRes.data ?? [],
    sources: sourcesRes.data ?? [],
  });
}
