import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** A typed Supabase client backed by the live database schema. */
export type Supabase = SupabaseClient<Database>;

export type ResearchRow = Database["public"]["Tables"]["research"]["Row"];
export type ResearchQuestionRow =
  Database["public"]["Tables"]["research_questions"]["Row"];
export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];
export type AnswerRow = Database["public"]["Tables"]["answers"]["Row"];
export type CitationRow = Database["public"]["Tables"]["citations"]["Row"];

export const ANSWER_STATUSES = [
  "pending",
  "generating",
  "complete",
  "failed",
] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export const DOCUMENT_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type CreateResearchInput = {
  title: string;
  description?: string;
};

export type UpdateResearchInput = {
  title?: string;
  description?: string | null;
};

export type CreateQuestionInput = {
  question: string;
  /**
   * When true, opt-in web research runs when the answer is generated and the
   * discovered sources are saved to the research. Persisted on the row so a
   * retry reproduces the original request.
   */
  includeWeb?: boolean;
};

export type CreateDocumentInput = {
  /**
   * Optional pre-generated document id, used when the storage path is built
   * from the document id before the row exists (upload-first flow).
   */
  id?: string;
  title: string;
  file_name: string;
  file_path: string;
  mime_type?: string;
  file_size?: number;
};

export type CreateSourceInput = {
  title: string;
  url?: string;
  publisher?: string;
  retrieved_at?: string;
  /** Optional body text that makes the source citable in answers. */
  content?: string;
};

export type CreateAnswerInput = {
  content: string;
  model?: string;
};

export type CreateCitationInput = {
  document_id?: string;
  source_id?: string;
  citation_number: number;
  excerpt?: string;
};

export type AnswerWithCitations = AnswerRow & {
  citations: CitationRow[];
};

export type QuestionWithAnswers = ResearchQuestionRow & {
  answers: AnswerWithCitations[];
};

/**
 * A document row with the heavy columns stripped out: `content` (up to
 * 200k characters of extracted body text) and the private storage `file_path`.
 * This is the shape used anywhere a document is rendered as metadata (the
 * documents library and research workspace); the retrieval path keeps the full
 * row because it needs `content` as evidence.
 */
export type DocumentSummary = Omit<DocumentRow, "content" | "file_path">;

/**
 * A source row without its `content` body text, plus a `has_content` flag so
 * the UI can still say whether the source is citable without pulling the text
 * into the workspace payload.
 */
export type SourceSummary = Omit<SourceRow, "content"> & {
  has_content: boolean;
};

export type ResearchWorkspace = {
  research: ResearchRow;
  questions: QuestionWithAnswers[];
  documents: DocumentSummary[];
  sources: SourceSummary[];
};
