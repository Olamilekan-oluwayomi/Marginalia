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

export type ResearchWorkspace = {
  research: ResearchRow;
  questions: QuestionWithAnswers[];
  documents: DocumentRow[];
  sources: SourceRow[];
};
