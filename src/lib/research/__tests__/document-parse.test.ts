import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("unpdf", () => ({
  getDocumentProxy: mocks.getDocumentProxy,
  extractText: mocks.extractText,
}));

import {
  extractDocumentText,
  mimeTypeFromName,
} from "@/lib/research/document-parse";

const PDF_BUFFER = new Uint8Array([1, 2, 3]);

function mockPdfText(text: string, options?: { throws?: boolean }) {
  mocks.getDocumentProxy.mockResolvedValue({});
  if (options?.throws) {
    mocks.extractText.mockRejectedValue(new Error("malformed pdf"));
  } else {
    mocks.extractText.mockResolvedValue({ text });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mimeTypeFromName", () => {
  it("returns octet-stream for empty or extension-less names", () => {
    expect(mimeTypeFromName("")).toBe("application/octet-stream");
    expect(mimeTypeFromName("README")).toBe("application/octet-stream");
    expect(mimeTypeFromName(".")).toBe("application/octet-stream");
    expect(mimeTypeFromName("file.")).toBe("application/octet-stream");
  });

  it("maps known extensions case-insensitively", () => {
    expect(mimeTypeFromName("paper.PDF")).toBe("application/pdf");
    expect(mimeTypeFromName("notes.md")).toBe("text/markdown");
    expect(mimeTypeFromName("README.markdown")).toBe("text/markdown");
    expect(mimeTypeFromName("a.txt")).toBe("text/plain");
    expect(mimeTypeFromName("a.text")).toBe("text/plain");
  });

  it("falls back to octet-stream for unknown extensions", () => {
    expect(mimeTypeFromName("archive.zip")).toBe("application/octet-stream");
  });
});

describe("extractDocumentText", () => {
  it("throws for an unsupported document type", async () => {
    await expect(
      extractDocumentText(PDF_BUFFER, "application/zip", "archive.zip"),
    ).rejects.toThrow(/Unsupported document type/);
  });

  it("extracts text from a PDF", async () => {
    mockPdfText("  hello world  ");

    const text = await extractDocumentText(
      PDF_BUFFER,
      "application/pdf",
      "paper.pdf",
    );

    expect(text).toBe("hello world");
    expect(mocks.getDocumentProxy).toHaveBeenCalledWith(PDF_BUFFER);
    expect(mocks.extractText).toHaveBeenCalledWith(expect.any(Object), {
      mergePages: true,
    });
  });

  it("falls back to the file name when the PDF mime is unknown", async () => {
    mockPdfText("paper");

    const text = await extractDocumentText(
      PDF_BUFFER,
      "application/octet-stream",
      "paper.pdf",
    );

    expect(text).toBe("paper");
    expect(mocks.getDocumentProxy).toHaveBeenCalledWith(PDF_BUFFER);
    expect(mocks.extractText).toHaveBeenCalled();
  });

  it("decodes plain text and markdown with the UTF-8 decoder", async () => {
    const bytes = new TextEncoder().encode("  plain body  ");

    const text = await extractDocumentText(bytes, "text/plain", "notes.txt");

    expect(text).toBe("plain body");
    expect(mocks.getDocumentProxy).not.toHaveBeenCalled();
  });

  it("surfaces a stable message when the PDF parser fails", async () => {
    mockPdfText("", { throws: true });

    await expect(
      extractDocumentText(PDF_BUFFER, "application/pdf", "paper.pdf"),
    ).rejects.toThrow("This PDF couldn't be read.");
  });

  it("throws when no extractable text is found", async () => {
    mockPdfText("   ");

    await expect(
      extractDocumentText(PDF_BUFFER, "application/pdf", "paper.pdf"),
    ).rejects.toThrow("No extractable text found in this document.");
  });

  it("caps extracted text at the limit", async () => {
    mockPdfText("x".repeat(250_000));

    const text = await extractDocumentText(
      PDF_BUFFER,
      "application/pdf",
      "paper.pdf",
    );

    expect(text).toHaveLength(200_000);
  });
});
