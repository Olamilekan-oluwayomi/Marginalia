import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  createDocument: vi.fn(),
  getResearchById: vi.fn(),
  requireUser: vi.fn(),
  requireUuid: vi.fn(),
  processDocument: vi.fn(),
  revalidatePath: vi.fn(),
  runAfterResponse: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/research/background", () => ({
  runAfterResponse: mocks.runAfterResponse,
}));
vi.mock("@/lib/research", () => ({
  createSupabaseClient: mocks.createSupabaseClient,
  createDocument: mocks.createDocument,
  getResearchById: mocks.getResearchById,
  requireUser: mocks.requireUser,
  requireUuid: mocks.requireUuid,
  deleteDocumentWithStorage: vi.fn(),
  getDocumentById: vi.fn(),
  resetDocumentToPending: vi.fn(),
}));
vi.mock("@/lib/research/document-processing", () => ({
  processDocument: mocks.processDocument,
}));

import { addDocumentAction } from "@/app/documents/actions";

const RESEARCH_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-1";
const initialState = { formError: null, success: false };

function pdfFormData(): FormData {
  const formData = new FormData();
  formData.set("researchId", RESEARCH_ID);
  const file = new File(
    [new Uint8Array([0x25, 0x50, 0x44, 0x46])],
    "paper.pdf",
    { type: "application/pdf" },
  );
  formData.set("file", file);
  return formData;
}

function makeSupabase(): { supabase: unknown } {
  const supabase = {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: mocks.upload,
        remove: mocks.remove,
      }),
    },
  };
  return { supabase };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUuid.mockReturnValue(null);
  mocks.createSupabaseClient.mockResolvedValue(makeSupabase().supabase);
  mocks.requireUser.mockResolvedValue({ user: { id: USER_ID } });
  mocks.getResearchById.mockResolvedValue({
    error: null,
    data: { id: RESEARCH_ID },
  });
  mocks.createDocument.mockResolvedValue({
    error: null,
    data: { id: "22222222-2222-4222-8222-222222222222" },
  });
  mocks.upload.mockResolvedValue({ error: null, data: { path: "x" } });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.processDocument.mockResolvedValue({ error: null, data: {} });
  mocks.runAfterResponse.mockImplementation(() => undefined);
});

describe("addDocumentAction", () => {
  it("rejects a non-UUID research id", async () => {
    mocks.requireUuid.mockReturnValue({ message: "Research id is invalid." });

    const state = await addDocumentAction(initialState, pdfFormData());

    expect(state.success).toBe(false);
    expect(state.formError).toContain("Choose which research");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects a missing file", async () => {
    const formData = new FormData();
    formData.set("researchId", RESEARCH_ID);

    const state = await addDocumentAction(initialState, formData);

    expect(state.success).toBe(false);
    expect(state.formError).toContain("Choose a PDF file");
  });

  it("rejects an empty file", async () => {
    const formData = new FormData();
    formData.set("researchId", RESEARCH_ID);
    formData.set(
      "file",
      new File([], "paper.pdf", { type: "application/pdf" }),
    );

    const state = await addDocumentAction(initialState, formData);

    expect(state.success).toBe(false);
    expect(state.formError).toContain("empty");
  });

  it("rejects an oversized file", async () => {
    const formData = new FormData();
    formData.set("researchId", RESEARCH_ID);
    formData.set(
      "file",
      new File([new Uint8Array(11 * 1024 * 1024)], "paper.pdf", {
        type: "application/pdf",
      }),
    );

    const state = await addDocumentAction(initialState, formData);

    expect(state.success).toBe(false);
    expect(state.formError).toContain("10 MB or smaller");
  });

  it("rejects a non-PDF file name", async () => {
    const formData = new FormData();
    formData.set("researchId", RESEARCH_ID);
    formData.set(
      "file",
      new File(["hello"], "notes.txt", { type: "text/plain" }),
    );

    const state = await addDocumentAction(initialState, formData);

    expect(state.success).toBe(false);
    expect(state.formError).toContain("Only PDF files");
  });

  it("rejects a non-PDF mime type", async () => {
    const formData = new FormData();
    formData.set("researchId", RESEARCH_ID);
    formData.set(
      "file",
      new File(["hello"], "paper.pdf", { type: "application/zip" }),
    );

    const state = await addDocumentAction(initialState, formData);

    expect(state.success).toBe(false);
    expect(state.formError).toContain("isn't a PDF");
  });

  it("surfaces a sign-in error", async () => {
    mocks.requireUser.mockResolvedValue({
      error: { code: "UNAUTHORIZED", message: "Sign in required." },
    });

    const state = await addDocumentAction(initialState, pdfFormData());

    expect(state.success).toBe(false);
    expect(state.formError).toContain("signed in");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects a research that no longer exists", async () => {
    mocks.getResearchById.mockResolvedValue({
      error: { code: "NOT_FOUND", message: "Research not found." },
      data: null,
    });

    const state = await addDocumentAction(initialState, pdfFormData());

    expect(state.success).toBe(false);
    expect(state.formError).toContain("no longer exists");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uploads, creates the document row, and schedules processing", async () => {
    const state = await addDocumentAction(initialState, pdfFormData());

    expect(state.success).toBe(true);
    expect(state.formError).toBeNull();

    expect(mocks.upload).toHaveBeenCalledOnce();
    const [pathArg, fileArg, optionsArg] = mocks.upload.mock.calls[0];
    expect(pathArg).toMatch(
      new RegExp(`^${USER_ID}/${RESEARCH_ID}/[0-9a-f-]{36}\\.pdf$`),
    );
    expect(fileArg.name).toBe("paper.pdf");
    expect(optionsArg).toEqual({
      contentType: "application/pdf",
      upsert: false,
    });

    expect(mocks.createDocument).toHaveBeenCalledOnce();
    const createArgs = mocks.createDocument.mock.calls[0];
    expect(createArgs[1]).toBe(RESEARCH_ID);
    expect(createArgs[2].title).toBe("paper.pdf");
    expect(createArgs[2].file_path).toBe(pathArg);
    expect(createArgs[2].mime_type).toBe("application/pdf");
    expect(createArgs[2].file_size).toBeGreaterThan(0);

    expect(mocks.runAfterResponse).toHaveBeenCalledOnce();
    expect(mocks.processDocument).not.toHaveBeenCalled();
    const task = mocks.runAfterResponse.mock.calls[0][0];
    await task();
    expect(mocks.processDocument).toHaveBeenCalledWith(
      expect.anything(),
      createArgs[2].id,
      RESEARCH_ID,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/documents");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/research/${RESEARCH_ID}`,
    );
  });

  it("removes the orphaned upload when the row insert fails", async () => {
    mocks.createDocument.mockResolvedValue({
      error: { code: "DATABASE_ERROR", message: "insert failed" },
      data: null,
    });

    const state = await addDocumentAction(initialState, pdfFormData());

    expect(state.success).toBe(false);
    expect(state.formError).toContain("couldn't save your document");
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.processDocument).not.toHaveBeenCalled();
  });

  it("returns success while background processing reports failures", async () => {
    mocks.processDocument.mockResolvedValue({
      error: { code: "DATABASE_ERROR", message: "Extraction failed." },
      data: null,
    });

    const state = await addDocumentAction(initialState, pdfFormData());

    expect(state.success).toBe(true);
    expect(state.formError).toBeNull();
    const task = mocks.runAfterResponse.mock.calls[0][0];
    await expect(task()).resolves.toBeUndefined();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/documents");
  });
});
