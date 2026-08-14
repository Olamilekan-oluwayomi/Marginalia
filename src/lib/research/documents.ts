import type { CreateDocumentInput, DocumentRow, Supabase } from "./types";
import {
  fail,
  notFound,
  ok,
  toAppError,
  validationError,
  type AppResult,
} from "./errors";
import { requireUser } from "./session";
import {
  optionalText,
  requireNumber,
  requireText,
  requireUuid,
} from "./validation";

const TITLE_MAX_LENGTH = 300;
const FILE_NAME_MAX_LENGTH = 300;
const FILE_PATH_MAX_LENGTH = 500;

function validateCreateInput(input: CreateDocumentInput): string | null {
  const titleError = requireText(input.title, "Title", TITLE_MAX_LENGTH);
  if (titleError) {
    return titleError.message;
  }
  const fileNameError = requireText(
    input.file_name,
    "File name",
    FILE_NAME_MAX_LENGTH
  );
  if (fileNameError) {
    return fileNameError.message;
  }
  const filePathError = requireText(
    input.file_path,
    "File path",
    FILE_PATH_MAX_LENGTH
  );
  if (filePathError) {
    return filePathError.message;
  }
  const mimeError = optionalText(input.mime_type, "MIME type", 100);
  if (mimeError) {
    return mimeError.message;
  }
  if (input.file_size !== undefined) {
    const sizeError = requireNumber(input.file_size, "File size", { min: 0 });
    if (sizeError) {
      return sizeError.message;
    }
  }
  return null;
}

export async function getDocuments(
  supabase: Supabase,
  researchId: string
): Promise<AppResult<DocumentRow[]>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), []);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, []);
  }

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("research_id", researchId)
    .order("created_at", { ascending: true });

  if (error) {
    return fail(toAppError(error), []);
  }

  return ok(data ?? []);
}

/**
 * Every document the authenticated user owns, newest first. Used by the
 * documents library. Ownership is enforced by RLS (`user_id = auth.uid()`),
 * so no caller-supplied scoping is needed.
 */
export async function getAllDocuments(
  supabase: Supabase
): Promise<AppResult<DocumentRow[]>> {
  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, []);
  }

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return fail(toAppError(error), []);
  }

  return ok(data ?? []);
}

/**
 * Fetches a single document by id. Ownership is enforced by RLS
 * (`documents_select_own`), so a caller can never reach another user's
 * document; a non-owned id resolves to NOT_FOUND.
 */
export async function getDocumentById(
  supabase: Supabase,
  documentId: string
): Promise<AppResult<DocumentRow | null>> {
  const idError = requireUuid(documentId, "Document id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Document not found."), null);
  }

  return ok(data);
}

export async function createDocument(
  supabase: Supabase,
  researchId: string,
  input: CreateDocumentInput
): Promise<AppResult<DocumentRow | null>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const validationMessage = validateCreateInput(input);
  if (validationMessage) {
    return fail(validationError(validationMessage), null);
  }

  if (input.id !== undefined) {
    const documentIdError = requireUuid(input.id, "Document id");
    if (documentIdError) {
      return fail(validationError(documentIdError.message), null);
    }
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      research_id: researchId,
      user_id: session.user.id,
      title: input.title.trim(),
      file_name: input.file_name.trim(),
      file_path: input.file_path.trim(),
      mime_type: input.mime_type?.trim() || null,
      file_size: input.file_size ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return fail(toAppError(error), null);
  }

  return ok(data);
}

/**
 * Claims a document for processing with an atomic `pending -> processing`
 * transition. Returns `true` when this caller won the claim, `false` when the
 * document was already claimed or no longer pending (another worker owns it).
 * The status pre-condition runs inside the database update, so two concurrent
 * callers can never both transition the same document; the loser must not
 * proceed.
 */
export async function setDocumentProcessing(
  supabase: Supabase,
  documentId: string
): Promise<AppResult<boolean>> {
  const idError = requireUuid(documentId, "Document id");
  if (idError) {
    return fail(validationError(idError.message), false);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, false);
  }

  const { data, error } = await supabase
    .from("documents")
    .update({ status: "processing" })
    .eq("id", documentId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), false);
  }
  if (!data) {
    return ok(false);
  }

  return ok(true);
}

export async function setDocumentReady(
  supabase: Supabase,
  documentId: string
): Promise<AppResult<null>> {
  return setDocumentStatus(supabase, documentId, "ready");
}

export async function setDocumentFailed(
  supabase: Supabase,
  documentId: string
): Promise<AppResult<null>> {
  return setDocumentStatus(supabase, documentId, "failed");
}

async function setDocumentStatus(
  supabase: Supabase,
  documentId: string,
  status: DocumentRow["status"]
): Promise<AppResult<null>> {
  const idError = requireUuid(documentId, "Document id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { error } = await supabase
    .from("documents")
    .update({ status })
    .eq("id", documentId);

  if (error) {
    return fail(toAppError(error), null);
  }

  return ok(null);
}

const CONTENT_MAX_LENGTH = 200_000;

/**
 * Persists extracted body text for a document. Returns the updated row so
 * callers can confirm the write actually landed (a zero-row update resolves
 * to NOT_FOUND) before marking the document ready.
 */
export async function setDocumentContent(
  supabase: Supabase,
  documentId: string,
  content: string
): Promise<AppResult<DocumentRow | null>> {
  const idError = requireUuid(documentId, "Document id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const contentError = requireText(content, "Content", CONTENT_MAX_LENGTH);
  if (contentError) {
    return fail(validationError(contentError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("documents")
    .update({ content: content.trim() })
    .eq("id", documentId)
    .select("*")
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Document not found."), null);
  }

  return ok(data);
}

/**
 * Records where a document's source file lives in storage. Best-effort
 * metadata: a zero-row update does not fail the operation.
 */
export async function setDocumentFilePath(
  supabase: Supabase,
  documentId: string,
  filePath: string
): Promise<AppResult<null>> {
  const idError = requireUuid(documentId, "Document id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const pathError = requireText(filePath, "File path", FILE_PATH_MAX_LENGTH);
  if (pathError) {
    return fail(validationError(pathError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { error } = await supabase
    .from("documents")
    .update({ file_path: filePath })
    .eq("id", documentId);

  if (error) {
    return fail(toAppError(error), null);
  }

  return ok(null);
}

/**
 * Resets a failed document back to `pending` so its extraction can be
 * retried. The `failed` pre-condition runs inside the database update, so two
 * concurrent retries cannot both reset the same document; the loser receives
 * `false` and must not reprocess. Only `failed` documents may be retried —
 * pending/processing/ready documents are left untouched.
 */
export async function resetDocumentToPending(
  supabase: Supabase,
  documentId: string
): Promise<AppResult<boolean>> {
  const idError = requireUuid(documentId, "Document id");
  if (idError) {
    return fail(validationError(idError.message), false);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, false);
  }

  const { data, error } = await supabase
    .from("documents")
    .update({ status: "pending" })
    .eq("id", documentId)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), false);
  }
  if (!data) {
    return ok(false);
  }

  return ok(true);
}

/**
 * Deletes a document and its private source object. Ownership is enforced by
 * RLS through `getDocumentById`/`deleteDocument`, so a caller can never reach
 * another user's document. The storage object is removed using the row's
 * stored `file_path`, which always begins with the owner's id, so the storage
 * RLS permits the removal. Removing the object is best-effort: a leftover
 * object in the private bucket is benign and must never block the user from
 * deleting their document.
 */
export async function deleteDocumentWithStorage(
  supabase: Supabase,
  documentId: string
): Promise<AppResult<null>> {
  const documentResult = await getDocumentById(supabase, documentId);
  if (documentResult.error) {
    return fail(documentResult.error, null);
  }
  const document = documentResult.data;
  if (!document) {
    return fail(notFound("Document not found."), null);
  }

  const deleteResult = await deleteDocument(supabase, documentId);
  if (deleteResult.error) {
    return deleteResult;
  }

  const { error: removeError } = await supabase.storage
    .from("documents")
    .remove([document.file_path]);
  if (removeError) {
    console.error(
      "[documents] could not remove the deleted document's object:",
      removeError.message
    );
  }

  return ok(null);
}

export async function deleteDocument(
  supabase: Supabase,
  documentId: string
): Promise<AppResult<null>> {
  const idError = requireUuid(documentId, "Document id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .select("id")
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Document not found."), null);
  }

  return ok(null);
}
