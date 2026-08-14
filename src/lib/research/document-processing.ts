import "server-only";

import type { Supabase } from "./types";
import {
  databaseError,
  fail,
  notFound,
  ok,
  validationError,
  type AppResult,
} from "./errors";
import { requireUuid } from "./validation";
import { requireUser } from "./session";
import {
  getDocumentById,
  setDocumentContent,
  setDocumentFailed,
  setDocumentProcessing,
  setDocumentReady,
} from "./documents";
import { extractDocumentText } from "./document-parse";

/**
 * Messages that are intentionally user-facing. Everything else that escapes
 * the extraction layer is reduced to a generic line so raw PDF parser or
 * provider details are never shown to users.
 */
const SAFE_EXTRACTION_MESSAGES = new Set([
  "No extractable text found in this document.",
  "This PDF couldn't be read.",
]);

function userFacingExtractionMessage(error: unknown): string {
  if (
    error instanceof Error &&
    (SAFE_EXTRACTION_MESSAGES.has(error.message) ||
      error.message.startsWith("Unsupported document type"))
  ) {
    return error.message;
  }
  return "We couldn't read that document.";
}

/**
 * Runs the Phase 8.2 processing pipeline for a single uploaded document:
 *
 *   1. Authenticate the caller.
 *   2. Load the document through the RLS-enforced data layer.
 *   3. Confirm the document belongs to the caller and to the expected
 *      research workspace (never trust caller-supplied ownership).
 *   4. Guard against reprocessing: only `pending` documents are processed;
 *      `ready` and `processing` documents are treated as already handled.
 *   5. Atomically claim the document with `pending -> processing`; only the
 *      winning caller continues (prevents duplicate processing).
 *   6. Download the PDF from the private `documents` bucket using the stored
 *      `file_path` (never reconstructed from a client filename).
 *   7. Extract body text with the shared pdf parser.
 *   8. Persist the extracted text to `documents.content`.
 *   9. Transition `processing` -> `ready`.
 *
 * Any failure after the `processing` transition marks the document `failed`
 * so the library never shows a false `ready`. Whitespace-only extractions
 * throw inside `extractDocumentText` and therefore fail the document.
 *
 * No `sources` row is created: documents are already first-class citable
 * evidence (`citations.document_id`), and a mirrored source would duplicate
 * the same body text in the answer context (`retrieveResearchContext`).
 *
 * Path revalidation is the caller's responsibility (Server Action layer).
 */
export async function processDocument(
  supabase: Supabase,
  documentId: string,
  researchId: string
): Promise<AppResult<null>> {
  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const documentIdError = requireUuid(documentId, "Document id");
  if (documentIdError) {
    return fail(validationError(documentIdError.message), null);
  }
  const researchIdError = requireUuid(researchId, "Research id");
  if (researchIdError) {
    return fail(validationError(researchIdError.message), null);
  }

  const documentResult = await getDocumentById(supabase, documentId);
  if (documentResult.error) {
    return fail(documentResult.error, null);
  }
  const document = documentResult.data;
  if (!document) {
    return fail(notFound("Document not found."), null);
  }
  if (document.user_id !== session.user.id) {
    return fail(notFound("Document not found."), null);
  }
  if (document.research_id !== researchId) {
    return fail(
      validationError("That document doesn't belong to that research."),
      null
    );
  }

  if (document.status === "ready") {
    return ok(null);
  }
  if (document.status === "processing") {
    return ok(null);
  }
  if (document.status !== "pending") {
    return fail(
      validationError("That document isn't waiting to be processed."),
      null
    );
  }

  const processingResult = await setDocumentProcessing(supabase, document.id);
  if (processingResult.error) {
    return fail(processingResult.error, null);
  }
  if (!processingResult.data) {
    // Another worker claimed the document between our read and the atomic
    // transition. It owns the pipeline now; never double-process.
    return ok(null);
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from("documents")
    .download(document.file_path);
  if (downloadError) {
    console.error(
      "[document-processing] storage download failed:",
      downloadError.message
    );
    await setDocumentFailed(supabase, document.id);
    return fail(
      databaseError("We couldn't read your uploaded document. Please try again."),
      null
    );
  }

  let content: string;
  try {
    content = await extractDocumentText(
      new Uint8Array(await blob.arrayBuffer()),
      document.mime_type ?? "",
      document.file_name
    );
  } catch (error) {
    console.error(
      "[document-processing] text extraction failed:",
      error instanceof Error ? error.message : String(error)
    );
    if (error instanceof Error && error.cause instanceof Error) {
      console.error(
        "[document-processing] text extraction cause:",
        error.cause.message
      );
    }
    await setDocumentFailed(supabase, document.id);
    return fail(validationError(userFacingExtractionMessage(error)), null);
  }

  const contentResult = await setDocumentContent(
    supabase,
    document.id,
    content
  );
  if (contentResult.error) {
    await setDocumentFailed(supabase, document.id);
    return fail(contentResult.error, null);
  }

  const readyResult = await setDocumentReady(supabase, document.id);
  if (readyResult.error) {
    return fail(readyResult.error, null);
  }

  return ok(null);
}
