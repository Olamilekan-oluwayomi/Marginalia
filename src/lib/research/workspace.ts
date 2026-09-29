import type {
  AnswerWithCitations,
  DocumentSummary,
  QuestionWithAnswers,
  ResearchWorkspace,
  SourceSummary,
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
import { requireUuid } from "./validation";

/**
 * Metadata columns for documents and sources — never `content` (up to 200k
 * characters of extracted body text) or the private storage `file_path`. The
 * workspace page only ever renders metadata, so selecting the heavy columns
 * would serialize potentially hundreds of kilobytes of evidence text into
 * every HTML response for no reason.
 */
const DOCUMENT_METADATA_COLUMNS =
  "id, research_id, user_id, title, file_name, mime_type, file_size, status, created_at, updated_at";
const SOURCE_METADATA_COLUMNS =
  "id, research_id, user_id, title, url, publisher, retrieved_at, created_at";

/**
 * Loads everything needed to render a research workspace in one pass:
 * the research record, its questions (each with the latest answers and their
 * citations), documents and sources. Documents and sources come back as
 * metadata-only summaries; the `has_content` flag on sources is resolved with
 * a separate lightweight query so the page can still label citable sources
 * without shipping their body text.
 */
export async function getResearchWorkspace(
  supabase: Supabase,
  researchId: string,
): Promise<AppResult<ResearchWorkspace | null>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const [
    researchRes,
    questionsRes,
    answersRes,
    documentsRes,
    sourcesRes,
    citableSourcesRes,
  ] = await Promise.all([
    supabase.from("research").select("*").eq("id", researchId).maybeSingle(),
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
      .select(DOCUMENT_METADATA_COLUMNS)
      .eq("research_id", researchId)
      .order("created_at", { ascending: true }),
    supabase
      .from("sources")
      .select(SOURCE_METADATA_COLUMNS)
      .eq("research_id", researchId)
      .order("created_at", { ascending: true }),
    supabase
      .from("sources")
      .select("id")
      .eq("research_id", researchId)
      .not("content", "is", null),
  ]);

  if (researchRes.error) {
    return fail(toAppError(researchRes.error), null);
  }
  if (!researchRes.data) {
    return fail(notFound("Research not found."), null);
  }

  for (const result of [
    questionsRes,
    answersRes,
    documentsRes,
    sourcesRes,
    citableSourcesRes,
  ]) {
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
    }),
  );

  const citableSourceIds = new Set(
    (citableSourcesRes.data ?? []).map((source) => source.id),
  );

  const documents = (documentsRes.data ?? []) as DocumentSummary[];
  const sources: SourceSummary[] = (
    (sourcesRes.data ?? []) as Omit<SourceSummary, "has_content">[]
  ).map((source) => ({
    ...source,
    has_content: citableSourceIds.has(source.id),
  }));

  return ok({
    research: researchRes.data,
    questions,
    documents,
    sources,
  });
}
