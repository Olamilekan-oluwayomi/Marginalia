import type {
  AnswerWithCitations,
  DocumentSummary,
  ListRange,
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

export type WorkspaceOptions = {
  /** Fetch one extra question to determine whether the next page exists. */
  questionRange?: ListRange;
  /** Fetch one extra document to determine whether the next page exists. */
  documentRange?: ListRange;
  /** Fetch one extra source to determine whether the next page exists. */
  sourceRange?: ListRange;
};

/**
 * Loads one paginated slice of each workspace collection. Answers are queried
 * only for the displayed question slice; documents and sources are metadata
 * summaries, and the source citable-status lookup is limited to displayed
 * source ids so no evidence body text is serialized into the page response.
 */
export async function getResearchWorkspace(
  supabase: Supabase,
  researchId: string,
  options: WorkspaceOptions = {},
): Promise<AppResult<ResearchWorkspace | null>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const questionsQuery = supabase
    .from("research_questions")
    .select("*")
    .eq("research_id", researchId)
    .order("created_at", { ascending: true });
  const documentsQuery = supabase
    .from("documents")
    .select(DOCUMENT_METADATA_COLUMNS)
    .eq("research_id", researchId)
    .order("created_at", { ascending: true });
  const sourcesQuery = supabase
    .from("sources")
    .select(SOURCE_METADATA_COLUMNS)
    .eq("research_id", researchId)
    .order("created_at", { ascending: true });

  const [researchRes, questionsRes, documentsRes, sourcesRes] =
    await Promise.all([
      supabase.from("research").select("*").eq("id", researchId).maybeSingle(),
      options.questionRange
        ? questionsQuery.range(
            options.questionRange.from,
            options.questionRange.to,
          )
        : questionsQuery,
      options.documentRange
        ? documentsQuery.range(
            options.documentRange.from,
            options.documentRange.to,
          )
        : documentsQuery,
      options.sourceRange
        ? sourcesQuery.range(options.sourceRange.from, options.sourceRange.to)
        : sourcesQuery,
    ]);

  if (researchRes.error) {
    return fail(toAppError(researchRes.error), null);
  }
  if (!researchRes.data) {
    return fail(notFound("Research not found."), null);
  }

  for (const result of [questionsRes, documentsRes, sourcesRes]) {
    if (result.error) {
      return fail(toAppError(result.error), null);
    }
  }

  const questionRows = questionsRes.data ?? [];
  const questionIds = questionRows.map((question) => question.id);
  const answersQuery = supabase
    .from("answers")
    .select("*, citations(*)")
    .eq("research_id", researchId);
  const answersRes =
    options.questionRange && questionIds.length > 0
      ? await answersQuery
          .in("question_id", questionIds)
          .order("created_at", { ascending: true })
      : await answersQuery.order("created_at", { ascending: true });

  if (answersRes.error) {
    return fail(toAppError(answersRes.error), null);
  }

  const sourceIds = (sourcesRes.data ?? []).map((source) => source.id);
  const citableSourcesQuery = supabase
    .from("sources")
    .select("id")
    .eq("research_id", researchId);
  const citableSourcesRes =
    options.sourceRange && sourceIds.length > 0
      ? await citableSourcesQuery.in("id", sourceIds).not("content", "is", null)
      : await citableSourcesQuery.not("content", "is", null);
  if (citableSourcesRes.error) {
    return fail(toAppError(citableSourcesRes.error), null);
  }

  const answersByQuestion = new Map<string, AnswerWithCitations[]>();
  for (const answer of (answersRes.data ?? []) as AnswerWithCitations[]) {
    const list = answersByQuestion.get(answer.question_id) ?? [];
    list.push(answer);
    answersByQuestion.set(answer.question_id, list);
  }

  const hasMoreQuestions =
    options.questionRange !== undefined &&
    questionRows.length > options.questionRange.to - options.questionRange.from;
  const visibleQuestionRows = hasMoreQuestions
    ? questionRows.slice(0, -1)
    : questionRows;
  const questions: QuestionWithAnswers[] = visibleQuestionRows.map(
    (question) => ({
      ...question,
      answers: answersByQuestion.get(question.id) ?? [],
    }),
  );

  const citableSourceIds = new Set(
    (citableSourcesRes.data ?? []).map((source) => source.id),
  );

  const documentRows = (documentsRes.data ?? []) as DocumentSummary[];
  const hasMoreDocuments =
    options.documentRange !== undefined &&
    documentRows.length > options.documentRange.to - options.documentRange.from;
  const documents = hasMoreDocuments ? documentRows.slice(0, -1) : documentRows;
  const sourceRows = (sourcesRes.data ?? []) as Omit<
    SourceSummary,
    "has_content"
  >[];
  const hasMoreSources =
    options.sourceRange !== undefined &&
    sourceRows.length > options.sourceRange.to - options.sourceRange.from;
  const sources: SourceSummary[] = (
    hasMoreSources ? sourceRows.slice(0, -1) : sourceRows
  ).map((source) => ({
    ...source,
    has_content: citableSourceIds.has(source.id),
  }));

  return ok({
    research: researchRes.data,
    questions,
    hasMoreQuestions,
    documents,
    hasMoreDocuments,
    sources,
    hasMoreSources,
  });
}
