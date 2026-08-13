"use server";

import { revalidatePath } from "next/cache";
import {
  createDocument,
  createSupabaseClient,
  requireUser,
  requireUuid,
  setDocumentContent,
  setDocumentFailed,
  setDocumentFilePath,
  setDocumentProcessing,
  setDocumentReady,
} from "@/lib/research";
import {
  extractDocumentText,
  MAX_DOCUMENT_BYTES,
  mimeTypeFromName,
} from "@/lib/research/document-parse";

export type AddDocumentState = {
  formError: string | null;
  success: boolean;
};

/**
 * Uploads a document for a research workspace, extracts its body text, and
 * stores it. The document row is created first through the RLS-scoped data
 * layer (ownership enforced server-side), then the file is uploaded under
 * `{user_id}/{document_id}/...` in the private `documents` bucket, and only
 * then is content extracted and the document marked `ready`.
 *
 * Every failure path keeps the document row in a consistent state: upload
 * failures delete the row, extraction failures mark the row `failed` and
 * remove the orphaned file, and the safe error message never leaks provider
 * or storage internals.
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
    return { formError: "Choose a file to upload.", success: false };
  }
  if (file.size === 0) {
    return { formError: "That file is empty.", success: false };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      formError: "Files must be 10 MB or smaller.",
      success: false,
    };
  }

  const supabase = await createSupabaseClient();
  const session = await requireUser(supabase);
  if ("error" in session) {
    return { formError: "You need to be signed in to do that.", success: false };
  }
  const userId = session.user.id;

  const fileName = file.name.trim();
  const mimeType = file.type || mimeTypeFromName(fileName);

  const createResult = await createDocument(supabase, researchId, {
    title: fileName,
    file_name: fileName,
    file_path: "",
    mime_type: mimeType,
    file_size: file.size,
  });
  if (createResult.error) {
    if (createResult.error.code === "NOT_FOUND") {
      return {
        formError: "That research no longer exists.",
        success: false,
      };
    }
    return {
      formError: "We couldn't upload your document. Please try again.",
      success: false,
    };
  }
  const document = createResult.data!;

  const storagePath = `${userId}/${document.id}/${fileName}`;
  const uploadResult = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadResult.error) {
    // Best-effort cleanup of the orphaned row; the file never landed.
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", document.id);
    if (error) {
      console.error(
        "[documents] could not clean up failed document row:",
        error.message
      );
    }
    return {
      formError: "We couldn't upload your document. Please try again.",
      success: false,
    };
  }

  const pathResult = await setDocumentFilePath(
    supabase,
    document.id,
    storagePath
  );
  if (pathResult.error) {
    console.error(
      "[documents] could not record file path:",
      pathResult.error.message
    );
  }

  await setDocumentProcessing(supabase, document.id);

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const content = await extractDocumentText(buffer, mimeType, fileName);

    const contentResult = await setDocumentContent(
      supabase,
      document.id,
      content
    );
    if (contentResult.error) {
      await setDocumentFailed(supabase, document.id);
      return {
        formError: "We couldn't process your document. Please try again.",
        success: false,
      };
    }

    await setDocumentReady(supabase, document.id);
  } catch (error) {
    console.error(
      "[documents] text extraction failed:",
      error instanceof Error ? error.message : String(error)
    );
    await setDocumentFailed(supabase, document.id);
    const { error: removeError } = await supabase.storage
      .from("documents")
      .remove([storagePath]);
    if (removeError) {
      console.error(
        "[documents] could not remove failed upload:",
        removeError.message
      );
    }
    return {
      formError:
        "We couldn't read that document. Try a PDF or plain-text file.",
      success: false,
    };
  }

  revalidatePath("/documents");
  revalidatePath(`/research/${researchId}`);
  return { formError: null, success: true };
}
