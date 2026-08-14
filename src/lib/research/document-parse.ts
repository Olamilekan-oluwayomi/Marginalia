import "server-only";

// Must stay above the pdf-parse import: pdfjs-dist (inside pdf-parse)
// needs globalThis.DOMMatrix at module load time. ESM evaluates imports in
// source order, so this side effect runs before pdf-parse evaluates.
import "./dommatrix-polyfill";

import { PDFParse } from "pdf-parse";

/** Upper bound on extracted body text kept per document. */
const MAX_CONTENT_CHARS = 200_000;

/** Maximum accepted upload size (must stay in sync with the storage bucket limit). */
export { MAX_UPLOAD_BYTES as MAX_DOCUMENT_BYTES } from "./document-upload";

type DocumentKind = "pdf" | "text";

/**
 * Best-effort MIME guess from the file name, used when the upload does not
 * carry a type. Returns `application/octet-stream` when the extension is
 * unknown rather than throwing.
 */
export function mimeTypeFromName(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  if (index <= 0 || index === fileName.length - 1) {
    return "application/octet-stream";
  }
  switch (fileName.slice(index + 1).toLowerCase()) {
    case "pdf":
      return "application/pdf";
    case "md":
    case "markdown":
      return "text/markdown";
    case "txt":
    case "text":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function detectKind(mimeType: string, fileName: string): DocumentKind | null {
  const normalized = mimeType.toLowerCase();
  if (normalized === "application/pdf" || normalized === "application/x-pdf") {
    return "pdf";
  }
  if (
    normalized === "text/plain" ||
    normalized === "text/markdown" ||
    normalized === "text/x-markdown"
  ) {
    return "text";
  }
  return mimeTypeFromName(fileName) === "application/pdf" ? "pdf" : null;
}

function normalizeText(raw: string): string {
  const text = raw.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim();
  return text.length > MAX_CONTENT_CHARS
    ? text.slice(0, MAX_CONTENT_CHARS)
    : text;
}

async function extractPdfText(buffer: Uint8Array): Promise<string> {
  const parser = new PDFParse({
    data: buffer,
    useSystemFonts: true,
  });
  try {
    const result = await parser.getText({ pageJoiner: "\n" });
    return result.text;
  } catch (cause) {
    // The parser's own error is not user-facing content. Preserve it as the
    // cause so the processing layer can log the real detail while users only
    // ever receive a stable, safe message.
    throw new Error("This PDF couldn't be read.", { cause });
  } finally {
    await parser.destroy();
  }
}

/**
 * Extracts body text from an uploaded document. Supports PDF and plain text
 * (including Markdown). Throws on unsupported types, empty extractions, or
 * parse failures; the caller decides how to surface the message. Every thrown
 * message is user-safe: parser internals are never included.
 */
export async function extractDocumentText(
  buffer: Uint8Array,
  mimeType: string,
  fileName: string
): Promise<string> {
  const kind = detectKind(mimeType, fileName);
  if (!kind) {
    throw new Error(
      `Unsupported document type (${mimeType || "unknown"}). Only PDF, TXT, and Markdown files are supported.`
    );
  }

  const raw =
    kind === "pdf"
      ? await extractPdfText(buffer)
      : new TextDecoder("utf-8", { fatal: false }).decode(buffer);

  const text = normalizeText(raw);
  if (text.length === 0) {
    throw new Error("No extractable text found in this document.");
  }
  return text;
}
