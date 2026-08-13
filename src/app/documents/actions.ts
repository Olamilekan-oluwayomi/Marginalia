"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import {
  createDocument,
  createSupabaseClient,
  getResearchById,
  requireUser,
  requireUuid,
} from "@/lib/research";
import {
  isPdfFileName,
  isPdfMime,
  MAX_UPLOAD_BYTES,
  PDF_MIME,
} from "@/lib/research/document-upload";
import { processDocument } from "@/lib/research/document-processing";

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
 *   4. Synchronous processing (Phase 8.2): extract body text, persist it to
 *      `documents.content`, and mark the document `ready` (or `failed`).
 *   5. If the row insert fails, the just-uploaded file is removed so no
 *      orphaned object is left behind.
 *
 * The storage path is derived entirely from the authenticated session and
 * server-generated identifiers — never from client-supplied paths or user
 * ids. The `documents` row's ownership is enforced by RLS and the
 * `enforce_child_ownership` trigger, so a user can never create a document
 * under a research workspace they do not own.
 */
export async function addDocumentAction(
  _prevState: AddDocumentState,
  formData: FormData
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
    return { formError: "You need to be signed in to do that.", success: false };
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
      uploadResult.error.message
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
        removeError.message
      );
    }
    return {
      formError: "We couldn't save your document. Please try again.",
      success: false,
    };
  }

  const processResult = await processDocument(supabase, documentId, researchId);
  revalidatePath("/documents");
  revalidatePath(`/research/${researchId}`);
  if (processResult.error) {
    return { formError: processResult.error.message, success: false };
  }

  return { formError: null, success: true };
}
