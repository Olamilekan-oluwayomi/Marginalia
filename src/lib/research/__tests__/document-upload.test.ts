import { describe, expect, it } from "vitest";
import {
  isPdfFileName,
  isPdfMime,
  MAX_UPLOAD_BYTES,
  PDF_MIME,
} from "@/lib/research/document-upload";

describe("MAX_UPLOAD_BYTES", () => {
  it("allows files up to 10 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("isPdfFileName", () => {
  it("accepts .pdf file names case-insensitively", () => {
    expect(isPdfFileName("paper.pdf")).toBe(true);
    expect(isPdfFileName("paper.PDF")).toBe(true);
    expect(isPdfFileName(" paper.pdf ")).toBe(true);
  });

  it("rejects non-PDF and extension-less file names", () => {
    expect(isPdfFileName("paper.txt")).toBe(false);
    expect(isPdfFileName("paper")).toBe(false);
    expect(isPdfFileName(".pdf")).toBe(false);
  });
});

describe("isPdfMime", () => {
  it("accepts the PDF MIME type case-insensitively", () => {
    expect(isPdfMime(PDF_MIME)).toBe(true);
    expect(isPdfMime("APPLICATION/PDF")).toBe(true);
  });

  it("accepts an empty MIME type", () => {
    expect(isPdfMime("")).toBe(true);
  });

  it("rejects other MIME types", () => {
    expect(isPdfMime("text/plain")).toBe(false);
    expect(isPdfMime("application/octet-stream")).toBe(false);
  });
});
