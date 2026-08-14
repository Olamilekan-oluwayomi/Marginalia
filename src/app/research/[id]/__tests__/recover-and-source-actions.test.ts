import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  tryTransitionQuestionStatus: vi.fn(),
  createSource: vi.fn(),
  getSourceById: vi.fn(),
  deleteSource: vi.fn(),
  requireText: vi.fn(),
  optionalText: vi.fn(),
  optionalDate: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/research/background", () => ({
  runAfterResponse: vi.fn(),
}));
vi.mock("@/lib/research", () => ({
  createSupabaseClient: mocks.createSupabaseClient,
  createQuestion: vi.fn(),
  createSource: mocks.createSource,
  getQuestionById: vi.fn(),
  getRecentUserQuestionCount: vi.fn(),
  getSourceById: mocks.getSourceById,
  deleteSource: mocks.deleteSource,
  generateAnswer: vi.fn(),
  tryTransitionQuestionStatus: mocks.tryTransitionQuestionStatus,
  requireText: mocks.requireText,
  optionalText: mocks.optionalText,
  optionalDate: mocks.optionalDate,
}));

import {
  addSourceAction,
  deleteSourceAction,
  recoverStuckAnswerAction,
} from "@/app/research/[id]/actions";

const RESEARCH_ID = "research-1";
const QUESTION_ID = "question-1";
const SOURCE_ID = "source-1";

function questionFormData(questionId: string): FormData {
  const formData = new FormData();
  formData.set("questionId", questionId);
  return formData;
}

const recoverInitialState = { formError: null };

function sourceFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("title", "Some page");
  formData.set("url", "https://example.com/page");
  formData.set("publisher", "Example");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

const addSourceInitialState = {
  fieldErrors: {},
  formError: null,
  success: false,
};

const source = {
  id: SOURCE_ID,
  research_id: RESEARCH_ID,
  user_id: "user-1",
  title: "Some page",
  url: "https://example.com/page",
  publisher: "Example",
  retrieved_at: null,
  content: null,
  created_at: "2026-08-13T00:00:00.000Z",
  updated_at: "2026-08-13T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseClient.mockResolvedValue({});
  mocks.tryTransitionQuestionStatus.mockResolvedValue({
    error: null,
    data: { transitioned: true },
  });
  mocks.createSource.mockResolvedValue({ error: null, data: source });
  mocks.getSourceById.mockResolvedValue({ error: null, data: source });
  mocks.deleteSource.mockResolvedValue({ error: null, data: null });
  mocks.requireText.mockReturnValue(null);
  mocks.optionalText.mockReturnValue(null);
  mocks.optionalDate.mockReturnValue(null);
});

describe("recoverStuckAnswerAction", () => {
  it("resets a stuck question to failed and revalidates", async () => {
    const state = await recoverStuckAnswerAction(
      RESEARCH_ID,
      recoverInitialState,
      questionFormData(QUESTION_ID)
    );

    expect(state.formError).toBeNull();
    expect(mocks.tryTransitionQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      QUESTION_ID,
      ["pending", "generating"],
      "failed"
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/research/${RESEARCH_ID}`
    );
  });

  it("surfaces a sign-in error", async () => {
    mocks.tryTransitionQuestionStatus.mockResolvedValue({
      error: { code: "UNAUTHORIZED", message: "Sign in required." },
      data: { transitioned: false },
    });

    const state = await recoverStuckAnswerAction(
      RESEARCH_ID,
      recoverInitialState,
      questionFormData(QUESTION_ID)
    );

    expect(state.formError).toContain("signed in");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a generic failure", async () => {
    mocks.tryTransitionQuestionStatus.mockResolvedValue({
      error: { code: "DATABASE_ERROR", message: "update failed" },
      data: { transitioned: false },
    });

    const state = await recoverStuckAnswerAction(
      RESEARCH_ID,
      recoverInitialState,
      questionFormData(QUESTION_ID)
    );

    expect(state.formError).toContain("couldn't reset this question");
  });

  it("reports when the question is no longer stuck", async () => {
    mocks.tryTransitionQuestionStatus.mockResolvedValue({
      error: null,
      data: { transitioned: false },
    });

    const state = await recoverStuckAnswerAction(
      RESEARCH_ID,
      recoverInitialState,
      questionFormData(QUESTION_ID)
    );

    expect(state.formError).toContain("isn't waiting anymore");
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });
});

describe("addSourceAction", () => {
  it("creates the source and revalidates", async () => {
    const state = await addSourceAction(
      RESEARCH_ID,
      addSourceInitialState,
      sourceFormData()
    );

    expect(state.success).toBe(true);
    expect(state.formError).toBeNull();
    expect(mocks.createSource).toHaveBeenCalledWith(expect.anything(), RESEARCH_ID, {
      title: "Some page",
      url: "https://example.com/page",
      publisher: "Example",
      retrieved_at: undefined,
      content: undefined,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/research/${RESEARCH_ID}`
    );
  });

  it("returns field errors without creating anything", async () => {
    mocks.requireText.mockReturnValue({
      message: "Title is required.",
    });

    const state = await addSourceAction(
      RESEARCH_ID,
      addSourceInitialState,
      sourceFormData()
    );

    expect(state.success).toBe(false);
    expect(state.fieldErrors.title).toBe("Title is required.");
    expect(mocks.createSource).not.toHaveBeenCalled();
  });

  it("surfaces a sign-in error", async () => {
    mocks.createSource.mockResolvedValue({
      error: { code: "UNAUTHORIZED", message: "Sign in required." },
      data: null,
    });

    const state = await addSourceAction(
      RESEARCH_ID,
      addSourceInitialState,
      sourceFormData()
    );

    expect(state.success).toBe(false);
    expect(state.formError).toContain("signed in");
  });

  it("surfaces a validation error message from the data layer", async () => {
    mocks.createSource.mockResolvedValue({
      error: {
        code: "VALIDATION_ERROR",
        message: "A source with this URL is already in this research.",
      },
      data: null,
    });

    const state = await addSourceAction(
      RESEARCH_ID,
      addSourceInitialState,
      sourceFormData()
    );

    expect(state.success).toBe(false);
    expect(state.formError).toContain("already in this research");
  });

  it("surfaces a generic failure", async () => {
    mocks.createSource.mockResolvedValue({
      error: { code: "DATABASE_ERROR", message: "insert failed" },
      data: null,
    });

    const state = await addSourceAction(
      RESEARCH_ID,
      addSourceInitialState,
      sourceFormData()
    );

    expect(state.success).toBe(false);
    expect(state.formError).toContain("couldn't add this source");
  });
});

describe("deleteSourceAction", () => {
  const deleteState = { error: null };

  function deleteFormData(sourceId: string): FormData {
    const formData = new FormData();
    formData.set("sourceId", sourceId);
    return formData;
  }

  it("deletes the source and revalidates its research workspace", async () => {
    const state = await deleteSourceAction(deleteState, deleteFormData(SOURCE_ID));

    expect(state.error).toBeNull();
    expect(mocks.deleteSource).toHaveBeenCalledWith(expect.anything(), SOURCE_ID);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/research/${RESEARCH_ID}`
    );
  });

  it("rejects a source that no longer exists", async () => {
    mocks.getSourceById.mockResolvedValue({
      error: { code: "NOT_FOUND", message: "Source not found." },
      data: null,
    });

    const state = await deleteSourceAction(deleteState, deleteFormData(SOURCE_ID));

    expect(state.error).toContain("no longer exists");
    expect(mocks.deleteSource).not.toHaveBeenCalled();
  });

  it("surfaces a sign-in error", async () => {
    mocks.getSourceById.mockResolvedValue({
      error: { code: "UNAUTHORIZED", message: "Sign in required." },
      data: null,
    });

    const state = await deleteSourceAction(deleteState, deleteFormData(SOURCE_ID));

    expect(state.error).toContain("signed in");
    expect(mocks.deleteSource).not.toHaveBeenCalled();
  });

  it("reports a failed delete", async () => {
    mocks.deleteSource.mockResolvedValue({
      error: { code: "DATABASE_ERROR", message: "delete failed" },
      data: null,
    });

    const state = await deleteSourceAction(deleteState, deleteFormData(SOURCE_ID));

    expect(state.error).toContain("couldn't delete this source");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
