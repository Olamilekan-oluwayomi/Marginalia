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

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
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

export async function setDocumentProcessing(
  supabase: Supabase,
  documentId: string
): Promise<AppResult<null>> {
  return setDocumentStatus(supabase, documentId, "processing");
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
