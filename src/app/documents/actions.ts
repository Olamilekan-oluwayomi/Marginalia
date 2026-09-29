"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { runAfterResponse } from "@/lib/research/background";
import {
  createDocument,
  createSupabaseClient,
  deleteDocumentWithStorage,
  getDocumentById,
  getResearchById,
  requireUser,
  requireUuid,
  resetDocumentToPending,
} from "@/lib/research";
import {
  isPdfFileName,
  isPdfMime,
  MAX_UPLOAD_BYTES,
  PDF_MIME,
} from "@/lib/research/document-upload";
import { processDocument } from "@/lib/research/document-processing";
import { describeError } from "@/lib/research/errors";

export type AddDocumentState = {
  formError: string | null;
  success: boolean;
};

/**
 * Uploads a PDF into the private `documents` storage bucket for the
 * authenticated user's own research workspace and creates the matching
 * `documents` row.
 *
 * Order of operations matters:
 *   1. Server-side validation (PDF only, size limit, research ownership).
 *   2. Storage upload to `{user_id}/{research_id}/{document_id}.pdf`.
 *   3. `documents` row insert with the real storage path; status `pending`.
 *   4. Schedule processing after the response: extract body text, persist it
 *      to `documents.content`, and mark the document `ready` (or `failed`).
 *   5. If the row insert fails, the just-uploaded file is removed so no
 *      orphaned object is left behind.
 *
 * The storage path is derived entirely from the authenticated session and
 * server-generated identifiers — never from client-supplied paths or user
 * ids. The `documents` row's ownership is enforced by RLS and the
 * `enforce_child_ownership` trigger, so a user can never create a document
 * under a research workspace they do not own.
 */
function scheduleDocumentProcessing(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  documentId: string,
  researchId: string,
): void {
  runAfterResponse(async () => {
    try {
      const result = await processDocument(supabase, documentId, researchId);
      if (result.error) {
        console.error(
          "[documents] background processing failed:",
          result.error.message,
        );
      }
    } catch (error) {
      console.error(
        "[documents] background processing threw unexpectedly:",
        describeError(error),
      );
    } finally {
      revalidatePath("/documents");
      revalidatePath(`/research/${researchId}`);
    }
  });
}

export async function addDocumentAction(
  _prevState: AddDocumentState,
  formData: FormData,
): Promise<AddDocumentState> {
  const researchId =
    (formData.get("researchId") as string | null)?.trim() ?? "";
  const file = formData.get("file");

  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return {
      formError: "Choose which research this document belongs to.",
      success: false,
    };
  }

  if (!(file instanceof File)) {
    return { formError: "Choose a PDF file to upload.", success: false };
  }
  if (file.size === 0) {
    return { formError: "That file is empty.", success: false };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      formError: "PDF files must be 10 MB or smaller.",
      success: false,
    };
  }
  if (!isPdfFileName(file.name)) {
    return { formError: "Only PDF files can be uploaded.", success: false };
  }
  if (!isPdfMime(file.type)) {
    return { formError: "That file isn't a PDF.", success: false };
  }

  const supabase = await createSupabaseClient();
  const session = await requireUser(supabase);
  if ("error" in session) {
    return {
      formError: "You need to be signed in to do that.",
      success: false,
    };
  }
  const userId = session.user.id;

  const researchResult = await getResearchById(supabase, researchId);
  if (researchResult.error) {
    return { formError: "That research no longer exists.", success: false };
  }

  const documentId = randomUUID();
  const fileName = file.name.trim();
  const storagePath = `${userId}/${researchId}/${documentId}.pdf`;

  const uploadResult = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: PDF_MIME,
      upsert: false,
    });
  if (uploadResult.error) {
    console.error(
      "[documents] storage upload failed:",
      uploadResult.error.message,
    );
    return {
      formError: "We couldn't upload your document. Please try again.",
      success: false,
    };
  }

  const createResult = await createDocument(supabase, researchId, {
    id: documentId,
    title: fileName,
    file_name: fileName,
    file_path: storagePath,
    mime_type: PDF_MIME,
    file_size: file.size,
  });
  if (createResult.error) {
    // Best-effort cleanup of the orphaned object; nothing was saved.
    const { error: removeError } = await supabase.storage
      .from("documents")
      .remove([storagePath]);
    if (removeError) {
      console.error(
        "[documents] could not remove orphaned upload:",
        removeError.message,
      );
    }
    return {
      formError: "We couldn't save your document. Please try again.",
      success: false,
    };
  }

  scheduleDocumentProcessing(supabase, documentId, researchId);
  revalidatePath("/documents");
  revalidatePath(`/research/${researchId}`);

  return { formError: null, success: true };
}

export type DeleteDocumentState = {
  error: string | null;
};

/**
 * Deletes a document and its private source file. The document is read first
 * (RLS-scoped, so another user's document resolves to NOT_FOUND) to resolve
 * the research workspace for revalidation; the data layer then removes the
 * storage object and the database row under the existing security model.
 */
export async function deleteDocumentAction(
  _prevState: DeleteDocumentState,
  formData: FormData,
): Promise<DeleteDocumentState> {
  const documentId =
    (formData.get("documentId") as string | null)?.trim() ?? "";

  const supabase = await createSupabaseClient();

  const documentResult = await getDocumentById(supabase, documentId);
  if (documentResult.error || !documentResult.data) {
    return {
      error:
        documentResult.error?.code === "UNAUTHORIZED"
          ? "You need to be signed in to do that."
          : "This document no longer exists.",
    };
  }
  const researchId = documentResult.data.research_id;

  const result = await deleteDocumentWithStorage(supabase, documentId);
  if (result.error) {
    return { error: "We couldn't delete this document. Please try again." };
  }

  revalidatePath("/documents");
  revalidatePath(`/research/${researchId}`);
  return { error: null };
}

export type RetryDocumentState = {
  error: string | null;
  success: boolean;
};

/**
 * Retries processing for a document that failed extraction. Only `failed`
 * documents are eligible: the atomic reset (`failed -> pending`) guarantees
 * two concurrent retries cannot both run, and the processing pipeline then
 * re-claims the document (`pending -> processing`) and either marks it
 * `ready` or leaves it `failed` again.
 */
export async function retryDocumentAction(
  _prevState: RetryDocumentState,
  formData: FormData,
): Promise<RetryDocumentState> {
  const documentId =
    (formData.get("documentId") as string | null)?.trim() ?? "";

  const supabase = await createSupabaseClient();

  const documentResult = await getDocumentById(supabase, documentId);
  if (documentResult.error || !documentResult.data) {
    return {
      error:
        documentResult.error?.code === "UNAUTHORIZED"
          ? "You need to be signed in to do that."
          : "This document no longer exists.",
      success: false,
    };
  }
  const document = documentResult.data;

  const resetResult = await resetDocumentToPending(supabase, document.id);
  if (resetResult.error) {
    return {
      error: "We couldn't retry this document. Please try again.",
      success: false,
    };
  }
  if (!resetResult.data) {
    return {
      error:
        "This document isn't ready to retry. Refresh the page to see its current state.",
      success: false,
    };
  }

  const processResult = await processDocument(
    supabase,
    document.id,
    document.research_id,
  );
  revalidatePath("/documents");
  revalidatePath(`/research/${document.research_id}`);
  if (processResult.error) {
    return { error: processResult.error.message, success: false };
  }

  return { error: null, success: true };
}
