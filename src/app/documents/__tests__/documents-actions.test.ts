import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  getDocumentById: vi.fn(),
  deleteDocumentWithStorage: vi.fn(),
  resetDocumentToPending: vi.fn(),
  processDocument: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/research", () => ({
  createSupabaseClient: mocks.createSupabaseClient,
  getDocumentById: mocks.getDocumentById,
  deleteDocumentWithStorage: mocks.deleteDocumentWithStorage,
  resetDocumentToPending: mocks.resetDocumentToPending,
  createDocument: vi.fn(),
  getResearchById: vi.fn(),
  requireUser: vi.fn(),
  requireUuid: vi.fn(),
}));
vi.mock("@/lib/research/document-processing", () => ({
  processDocument: mocks.processDocument,
}));

import {
  deleteDocumentAction,
  retryDocumentAction,
} from "@/app/documents/actions";

const RESEARCH_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";

function deleteFormData(documentId: string): FormData {
  const formData = new FormData();
  formData.set("documentId", documentId);
  return formData;
}

const document = {
  id: DOCUMENT_ID,
  research_id: RESEARCH_ID,
  user_id: "user-1",
  title: "paper.pdf",
  file_name: "paper.pdf",
  file_path: `${"user-1"}/${RESEARCH_ID}/${DOCUMENT_ID}.pdf`,
  mime_type: "application/pdf",
  file_size: 1000,
  status: "failed",
  content: null,
  created_at: "2026-08-13T00:00:00.000Z",
  updated_at: "2026-08-13T00:00:00.000Z",
};

const initialState = { error: null };
const retryInitialState = { error: null, success: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseClient.mockResolvedValue({});
  mocks.getDocumentById.mockResolvedValue({ error: null, data: document });
  mocks.deleteDocumentWithStorage.mockResolvedValue({
    error: null,
    data: null,
  });
  mocks.resetDocumentToPending.mockResolvedValue({ error: null, data: true });
  mocks.processDocument.mockResolvedValue({ error: null, data: {} });
});

describe("deleteDocumentAction", () => {
  it("deletes the document and revalidates its research workspace", async () => {
    const state = await deleteDocumentAction(
      initialState,
      deleteFormData(DOCUMENT_ID),
    );

    expect(state.error).toBeNull();
    expect(mocks.deleteDocumentWithStorage).toHaveBeenCalledWith(
      expect.anything(),
      DOCUMENT_ID,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/documents");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/research/${RESEARCH_ID}`,
    );
  });

  it("rejects a document that no longer exists", async () => {
    mocks.getDocumentById.mockResolvedValue({
      error: { code: "NOT_FOUND", message: "Document not found." },
      data: null,
    });

    const state = await deleteDocumentAction(
      initialState,
      deleteFormData(DOCUMENT_ID),
    );

    expect(state.error).toContain("no longer exists");
    expect(mocks.deleteDocumentWithStorage).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a sign-in error", async () => {
    mocks.getDocumentById.mockResolvedValue({
      error: { code: "UNAUTHORIZED", message: "Sign in required." },
      data: null,
    });

    const state = await deleteDocumentAction(
      initialState,
      deleteFormData(DOCUMENT_ID),
    );

    expect(state.error).toContain("signed in");
    expect(mocks.deleteDocumentWithStorage).not.toHaveBeenCalled();
  });

  it("reports a failed delete without revalidating", async () => {
    mocks.deleteDocumentWithStorage.mockResolvedValue({
      error: { code: "DATABASE_ERROR", message: "delete failed" },
      data: null,
    });

    const state = await deleteDocumentAction(
      initialState,
      deleteFormData(DOCUMENT_ID),
    );

    expect(state.error).toContain("couldn't delete");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("retryDocumentAction", () => {
  it("resets a failed document and reprocesses it", async () => {
    const state = await retryDocumentAction(
      retryInitialState,
      deleteFormData(DOCUMENT_ID),
    );

    expect(state.error).toBeNull();
    expect(state.success).toBe(true);
    expect(mocks.resetDocumentToPending).toHaveBeenCalledWith(
      expect.anything(),
      DOCUMENT_ID,
    );
    expect(mocks.processDocument).toHaveBeenCalledWith(
      expect.anything(),
      DOCUMENT_ID,
      RESEARCH_ID,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/documents");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/research/${RESEARCH_ID}`,
    );
  });

  it("does not reprocess a document that no longer exists", async () => {
    mocks.getDocumentById.mockResolvedValue({
      error: { code: "NOT_FOUND", message: "Document not found." },
      data: null,
    });

    const state = await retryDocumentAction(
      retryInitialState,
      deleteFormData(DOCUMENT_ID),
    );

    expect(state.error).toContain("no longer exists");
    expect(state.success).toBe(false);
    expect(mocks.resetDocumentToPending).not.toHaveBeenCalled();
    expect(mocks.processDocument).not.toHaveBeenCalled();
  });

  it("does not reprocess when the reset does not win (already claimed)", async () => {
    mocks.resetDocumentToPending.mockResolvedValue({
      error: null,
      data: false,
    });

    const state = await retryDocumentAction(
      retryInitialState,
      deleteFormData(DOCUMENT_ID),
    );

    expect(state.error).toContain("isn't ready to retry");
    expect(state.success).toBe(false);
    expect(mocks.processDocument).not.toHaveBeenCalled();
  });

  it("surfaces a sign-in error without touching the document", async () => {
    mocks.getDocumentById.mockResolvedValue({
      error: { code: "UNAUTHORIZED", message: "Sign in required." },
      data: null,
    });

    const state = await retryDocumentAction(
      retryInitialState,
      deleteFormData(DOCUMENT_ID),
    );

    expect(state.error).toContain("signed in");
    expect(mocks.resetDocumentToPending).not.toHaveBeenCalled();
    expect(mocks.processDocument).not.toHaveBeenCalled();
  });

  it("reports a processing failure with its message", async () => {
    mocks.processDocument.mockResolvedValue({
      error: { code: "DATABASE_ERROR", message: "Extraction failed." },
      data: null,
    });

    const state = await retryDocumentAction(
      retryInitialState,
      deleteFormData(DOCUMENT_ID),
    );

    expect(state.error).toBe("Extraction failed.");
    expect(state.success).toBe(false);
  });
});
