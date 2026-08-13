import { beforeEach, describe, expect, it, vi } from "vitest";
import { notFound, unauthorized } from "@/lib/research/errors";
import type { DocumentRow, Supabase } from "@/lib/research/types";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDocumentById: vi.fn(),
  setDocumentProcessing: vi.fn(),
  setDocumentContent: vi.fn(),
  setDocumentReady: vi.fn(),
  setDocumentFailed: vi.fn(),
  extractDocumentText: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/research/session", () => ({
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/research/documents", () => ({
  getDocumentById: mocks.getDocumentById,
  setDocumentProcessing: mocks.setDocumentProcessing,
  setDocumentContent: mocks.setDocumentContent,
  setDocumentReady: mocks.setDocumentReady,
  setDocumentFailed: mocks.setDocumentFailed,
}));
vi.mock("@/lib/research/document-parse", () => ({
  extractDocumentText: mocks.extractDocumentText,
}));

import { processDocument } from "@/lib/research/document-processing";

const USER_ID = "user-1";
const RESEARCH_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_RESEARCH_ID = "33333333-3333-4333-8333-333333333333";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const STORAGE_PATH = `${USER_ID}/${RESEARCH_ID}/${DOCUMENT_ID}.pdf`;

function makeDocument(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: DOCUMENT_ID,
    research_id: RESEARCH_ID,
    user_id: USER_ID,
    title: "paper.pdf",
    file_name: "paper.pdf",
    file_path: STORAGE_PATH,
    mime_type: "application/pdf",
    file_size: 1000,
    status: "pending",
    content: null,
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

function storageStub(downloadResult: { data: Blob | null; error: unknown }) {
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        download: vi.fn().mockResolvedValue(downloadResult),
      }),
    },
  } as unknown as Supabase;
}

const UNATHORIZED_SESSION = {
  error: unauthorized(),
};
const AUTH_SESSION = { user: { id: USER_ID } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(AUTH_SESSION);
  mocks.setDocumentProcessing.mockResolvedValue({ data: true, error: null });
  mocks.setDocumentReady.mockResolvedValue({ data: null, error: null });
  mocks.setDocumentFailed.mockResolvedValue({ data: null, error: null });
});

describe("processDocument", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNATHORIZED_SESSION);

    const result = await processDocument({} as Supabase, DOCUMENT_ID, RESEARCH_ID);

    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(mocks.getDocumentById).not.toHaveBeenCalled();
  });

  it("rejects an invalid document id", async () => {
    const result = await processDocument(
      {} as Supabase,
      "not-a-uuid",
      RESEARCH_ID
    );

    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(mocks.getDocumentById).not.toHaveBeenCalled();
  });

  it("returns not found when the document does not exist", async () => {
    mocks.getDocumentById.mockResolvedValue({
      data: null,
      error: notFound("Document not found."),
    });

    const result = await processDocument({} as Supabase, DOCUMENT_ID, RESEARCH_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
    expect(mocks.setDocumentProcessing).not.toHaveBeenCalled();
  });

  it("rejects a document owned by another user", async () => {
    mocks.getDocumentById.mockResolvedValue({
      data: makeDocument({ user_id: "someone-else" }),
      error: null,
    });

    const result = await processDocument({} as Supabase, DOCUMENT_ID, RESEARCH_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
    expect(mocks.setDocumentProcessing).not.toHaveBeenCalled();
  });

  it("rejects a document that belongs to a different research", async () => {
    mocks.getDocumentById.mockResolvedValue({
      data: makeDocument(),
      error: null,
    });

    const result = await processDocument(
      {} as Supabase,
      DOCUMENT_ID,
      OTHER_RESEARCH_ID
    );

    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(mocks.setDocumentProcessing).not.toHaveBeenCalled();
  });

  it("skips a document that is already ready", async () => {
    mocks.getDocumentById.mockResolvedValue({
      data: makeDocument({ status: "ready" }),
      error: null,
    });

    const result = await processDocument({} as Supabase, DOCUMENT_ID, RESEARCH_ID);

    expect(result.error).toBeNull();
    expect(mocks.setDocumentProcessing).not.toHaveBeenCalled();
    expect(mocks.setDocumentContent).not.toHaveBeenCalled();
  });

  it("treats a document already being processed as a no-op", async () => {
    mocks.getDocumentById.mockResolvedValue({
      data: makeDocument({ status: "processing" }),
      error: null,
    });

    const result = await processDocument({} as Supabase, DOCUMENT_ID, RESEARCH_ID);

    expect(result.error).toBeNull();
    expect(mocks.setDocumentProcessing).not.toHaveBeenCalled();
    expect(mocks.setDocumentContent).not.toHaveBeenCalled();
  });

  it("does not double-process when another worker already claimed the document", async () => {
    mocks.getDocumentById.mockResolvedValue({
      data: makeDocument(),
      error: null,
    });
    mocks.setDocumentProcessing.mockResolvedValue({ data: false, error: null });
    const supabase = storageStub({ data: null, error: null });

    const result = await processDocument(supabase, DOCUMENT_ID, RESEARCH_ID);

    expect(result.error).toBeNull();
    expect(mocks.setDocumentProcessing).toHaveBeenCalledTimes(1);
    expect(supabase.storage.from).not.toHaveBeenCalled();
    expect(mocks.extractDocumentText).not.toHaveBeenCalled();
    expect(mocks.setDocumentContent).not.toHaveBeenCalled();
    expect(mocks.setDocumentReady).not.toHaveBeenCalled();
  });

  it("rejects a document that is not waiting to be processed", async () => {
    mocks.getDocumentById.mockResolvedValue({
      data: makeDocument({ status: "failed" }),
      error: null,
    });

    const result = await processDocument({} as Supabase, DOCUMENT_ID, RESEARCH_ID);

    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(mocks.setDocumentProcessing).not.toHaveBeenCalled();
  });

  it("marks the document failed when the storage download fails", async () => {
    mocks.getDocumentById.mockResolvedValue({
      data: makeDocument(),
      error: null,
    });
    const supabase = storageStub({ data: null, error: { message: "missing" } });

    const result = await processDocument(supabase, DOCUMENT_ID, RESEARCH_ID);

    expect(result.error).not.toBeNull();
    expect(mocks.setDocumentFailed).toHaveBeenCalledTimes(1);
    expect(mocks.setDocumentContent).not.toHaveBeenCalled();
  });

  it("marks the document failed when extraction produces no meaningful text", async () => {
    mocks.getDocumentById.mockResolvedValue({
      data: makeDocument(),
      error: null,
    });
    mocks.extractDocumentText.mockRejectedValue(
      new Error("No extractable text found in this document.")
    );
    const supabase = storageStub({ data: new Blob(["fake"]), error: null });

    const result = await processDocument(supabase, DOCUMENT_ID, RESEARCH_ID);

    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.message).toContain("No extractable text");
    expect(mocks.setDocumentFailed).toHaveBeenCalledTimes(1);
    expect(mocks.setDocumentContent).not.toHaveBeenCalled();
  });

  it("marks the document failed when persisting content fails", async () => {
    mocks.getDocumentById.mockResolvedValue({
      data: makeDocument(),
      error: null,
    });
    mocks.extractDocumentText.mockResolvedValue("extracted body text");
    mocks.setDocumentContent.mockResolvedValue({
      data: null,
      error: { code: "DATABASE_ERROR", message: "database error" },
    });
    const supabase = storageStub({ data: new Blob(["fake"]), error: null });

    const result = await processDocument(supabase, DOCUMENT_ID, RESEARCH_ID);

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(mocks.setDocumentFailed).toHaveBeenCalledTimes(1);
    expect(mocks.setDocumentReady).not.toHaveBeenCalled();
  });

  it("processes a pending document end to end", async () => {
    mocks.getDocumentById.mockResolvedValue({
      data: makeDocument(),
      error: null,
    });
    mocks.extractDocumentText.mockResolvedValue("extracted body text");
    mocks.setDocumentContent.mockResolvedValue({
      data: makeDocument({ content: "extracted body text" }),
      error: null,
    });
    const supabase = storageStub({ data: new Blob(["fake"]), error: null });

    const result = await processDocument(supabase, DOCUMENT_ID, RESEARCH_ID);

    expect(result.error).toBeNull();
    expect(mocks.setDocumentProcessing).toHaveBeenCalledWith(
      supabase,
      DOCUMENT_ID
    );
    expect(supabase.storage.from).toHaveBeenCalledWith("documents");
    expect(mocks.extractDocumentText).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "application/pdf",
      "paper.pdf"
    );
    expect(mocks.setDocumentContent).toHaveBeenCalledWith(
      supabase,
      DOCUMENT_ID,
      "extracted body text"
    );
    expect(mocks.setDocumentReady).toHaveBeenCalledWith(supabase, DOCUMENT_ID);
    expect(mocks.setDocumentFailed).not.toHaveBeenCalled();

    const [processingOrder, contentOrder, readyOrder] = [
      mocks.setDocumentProcessing.mock.invocationCallOrder[0],
      mocks.setDocumentContent.mock.invocationCallOrder[0],
      mocks.setDocumentReady.mock.invocationCallOrder[0],
    ];
    expect(processingOrder).toBeLessThan(contentOrder);
    expect(contentOrder).toBeLessThan(readyOrder);
  });
});
