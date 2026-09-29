import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  getQuestionById: vi.fn(),
  tryTransitionQuestionStatus: vi.fn(),
  generateAnswer: vi.fn(),
  revalidatePath: vi.fn(),
  runAfterResponse: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/research/background", () => ({
  runAfterResponse: mocks.runAfterResponse,
}));
vi.mock("@/lib/research", () => ({
  createSupabaseClient: mocks.createSupabaseClient,
  getQuestionById: mocks.getQuestionById,
  tryTransitionQuestionStatus: mocks.tryTransitionQuestionStatus,
  generateAnswer: mocks.generateAnswer,
  createQuestion: vi.fn(),
  createSource: vi.fn(),
  getRecentUserQuestionCount: vi.fn(),
  optionalDate: () => null,
  optionalText: () => null,
  requireText: () => null,
}));

import { retryAnswerAction } from "@/app/research/[id]/actions";

const RESEARCH_ID = "research-1";

function formDataWith(questionId: string): FormData {
  const formData = new FormData();
  formData.set("questionId", questionId);
  return formData;
}

const question = {
  id: "question-1",
  research_id: RESEARCH_ID,
  user_id: "user-1",
  question: "What is the capital of France?",
  answer_status: "failed",
  created_at: "2026-08-13T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseClient.mockResolvedValue({});
  mocks.getQuestionById.mockResolvedValue({ error: null, data: question });
  mocks.tryTransitionQuestionStatus.mockResolvedValue({
    error: null,
    data: { transitioned: true },
  });
  mocks.generateAnswer.mockResolvedValue({ error: null, data: {} });
  mocks.runAfterResponse.mockImplementation(() => undefined);
});

describe("retryAnswerAction", () => {
  it("schedules generation for a failed question owned by the research", async () => {
    const state = await retryAnswerAction(
      RESEARCH_ID,
      { formError: null },
      formDataWith("question-1"),
    );

    expect(state.formError).toBeNull();
    expect(mocks.tryTransitionQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      "question-1",
      ["failed"],
      "pending",
    );

    // The action returns immediately; generation runs after the response.
    expect(mocks.runAfterResponse).toHaveBeenCalledOnce();
    expect(mocks.generateAnswer).not.toHaveBeenCalled();

    const task = mocks.runAfterResponse.mock.calls[0][0];
    await task();

    expect(mocks.generateAnswer).toHaveBeenCalledWith(expect.anything(), {
      questionId: "question-1",
      researchId: RESEARCH_ID,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/research/${RESEARCH_ID}`,
    );
  });

  it("does not schedule generation for a question that belongs to another research", async () => {
    mocks.getQuestionById.mockResolvedValue({
      error: null,
      data: { ...question, research_id: "research-other" },
    });

    const state = await retryAnswerAction(
      RESEARCH_ID,
      { formError: null },
      formDataWith("question-1"),
    );

    expect(state.formError).toContain("does not belong");
    expect(mocks.tryTransitionQuestionStatus).not.toHaveBeenCalled();
    expect(mocks.runAfterResponse).not.toHaveBeenCalled();
  });

  it("does not schedule generation for a question that no longer exists", async () => {
    mocks.getQuestionById.mockResolvedValue({
      error: { code: "NOT_FOUND", message: "Question not found." },
      data: null,
    });

    const state = await retryAnswerAction(
      RESEARCH_ID,
      { formError: null },
      formDataWith("question-1"),
    );

    expect(state.formError).toContain("no longer exists");
    expect(mocks.tryTransitionQuestionStatus).not.toHaveBeenCalled();
    expect(mocks.runAfterResponse).not.toHaveBeenCalled();
  });

  it("surfaces a sign-in error", async () => {
    mocks.getQuestionById.mockResolvedValue({
      error: { code: "UNAUTHORIZED", message: "Sign in required." },
      data: null,
    });

    const state = await retryAnswerAction(
      RESEARCH_ID,
      { formError: null },
      formDataWith("question-1"),
    );

    expect(state.formError).toContain("signed in");
    expect(mocks.tryTransitionQuestionStatus).not.toHaveBeenCalled();
    expect(mocks.runAfterResponse).not.toHaveBeenCalled();
  });

  it("refuses when the guarded transition does not win", async () => {
    mocks.tryTransitionQuestionStatus.mockResolvedValue({
      error: null,
      data: { transitioned: false },
    });

    const state = await retryAnswerAction(
      RESEARCH_ID,
      { formError: null },
      formDataWith("question-1"),
    );

    expect(state.formError).toContain("isn't ready to retry");
    expect(mocks.generateAnswer).not.toHaveBeenCalled();
    expect(mocks.runAfterResponse).not.toHaveBeenCalled();
  });
});
