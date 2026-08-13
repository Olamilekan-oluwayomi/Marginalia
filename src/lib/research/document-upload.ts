/**
 * Shared constants and validation helpers for the document upload flow.
 *
 * This module is dependency-free and safe to import from both client
 * components and server actions, so the client and server enforce exactly the
 * same rules from a single source of truth.
 */

/** Maximum accepted upload size (10 MB). Must stay in sync with the storage
 * bucket's file_size_limit. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The only MIME type accepted for document uploads. */
export const PDF_MIME = "application/pdf";

/** True when the file name ends in `.pdf` (case-insensitive). */
export function isPdfFileName(fileName: string): boolean {
  const name = fileName.trim().toLowerCase();
  return name.length > 4 && name.endsWith(".pdf");
}

/**
 * True when the MIME type is the PDF MIME type. An empty MIME type is
 * accepted because some platforms omit it; the file-name extension check
 * remains the authoritative client/server gate.
 */
export function isPdfMime(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  return mime === "" || mime === PDF_MIME;
}
