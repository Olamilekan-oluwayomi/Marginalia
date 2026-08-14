import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  createQuestion: vi.fn(),
  getRecentUserQuestionCount: vi.fn(),
  generateAnswer: vi.fn(),
  revalidatePath: vi.fn(),
  runAfterResponse: vi.fn(),
  requireText: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/research/background", () => ({
  runAfterResponse: mocks.runAfterResponse,
}));
vi.mock("@/lib/research", () => ({
  createSupabaseClient: mocks.createSupabaseClient,
  createQuestion: mocks.createQuestion,
  getRecentUserQuestionCount: mocks.getRecentUserQuestionCount,
  generateAnswer: mocks.generateAnswer,
  createSource: vi.fn(),
  getQuestionById: vi.fn(),
  tryTransitionQuestionStatus: vi.fn(),
  optionalDate: () => null,
  optionalText: () => null,
  requireText: mocks.requireText,
}));

import { askQuestionAction } from "@/app/research/[id]/actions";

const RESEARCH_ID = "research-1";

function formDataWith(
  question: string,
  includeWeb = false
): FormData {
  const formData = new FormData();
  formData.set("question", question);
  if (includeWeb) formData.set("includeWeb", "on");
  return formData;
}

const createdQuestion = {
  id: "question-1",
  research_id: RESEARCH_ID,
  user_id: "user-1",
  question: "What is the capital of France?",
  answer_status: "pending",
  created_at: "2026-08-13T00:00:00.000Z",
};

const initialState = {
  fieldErrors: {},
  formError: null,
  success: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireText.mockReturnValue(null);
  mocks.createSupabaseClient.mockResolvedValue({});
  mocks.getRecentUserQuestionCount.mockResolvedValue({ error: null, data: 0 });
  mocks.createQuestion.mockResolvedValue({ error: null, data: createdQuestion });
  mocks.generateAnswer.mockResolvedValue({ error: null, data: {} });
  mocks.runAfterResponse.mockImplementation(() => undefined);
});

describe("askQuestionAction", () => {
  it("creates the question and schedules generation after the response", async () => {
    const state = await askQuestionAction(
      RESEARCH_ID,
      initialState,
      formDataWith("What is the capital of France?", true)
    );

    expect(state.success).toBe(true);
    expect(state.formError).toBeNull();
    expect(mocks.createQuestion).toHaveBeenCalledWith(
      expect.anything(),
      RESEARCH_ID,
      {
        question: "What is the capital of France?",
        includeWeb: true,
      }
    );

    // The action returns immediately; generation runs after the response.
    expect(mocks.runAfterResponse).toHaveBeenCalledOnce();
    expect(mocks.generateAnswer).not.toHaveBeenCalled();

    const task = mocks.runAfterResponse.mock.calls[0][0];
    await task();

    expect(mocks.generateAnswer).toHaveBeenCalledWith(expect.anything(), {
      questionId: createdQuestion.id,
      researchId: RESEARCH_ID,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/research/${RESEARCH_ID}`
    );
  });

  it("revalidates the route even when background generation throws", async () => {
    const state = await askQuestionAction(
      RESEARCH_ID,
      initialState,
      formDataWith("What is the capital of France?")
    );

    expect(state.success).toBe(true);

    const task = mocks.runAfterResponse.mock.calls[0][0];
    mocks.generateAnswer.mockRejectedValue(new Error("boom"));
    await expect(task()).resolves.toBeUndefined();

    expect(mocks.generateAnswer).toHaveBeenCalledWith(expect.anything(), {
      questionId: createdQuestion.id,
      researchId: RESEARCH_ID,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/research/${RESEARCH_ID}`
    );
  });

  it("does not flag web research when the checkbox is unchecked", async () => {
    const state = await askQuestionAction(
      RESEARCH_ID,
      initialState,
      formDataWith("What is the capital of France?")
    );

    expect(state.success).toBe(true);
    expect(mocks.createQuestion).toHaveBeenCalledWith(
      expect.anything(),
      RESEARCH_ID,
      { question: "What is the capital of France?", includeWeb: false }
    );
  });

  it("rejects an empty question without scheduling anything", async () => {
    mocks.requireText.mockReturnValue({
      message: "Question is required.",
    });

    const state = await askQuestionAction(
      RESEARCH_ID,
      initialState,
      formDataWith("  ")
    );

    expect(state.success).toBe(false);
    expect(state.fieldErrors.question).toBe("Question is required.");
    expect(mocks.createQuestion).not.toHaveBeenCalled();
    expect(mocks.runAfterResponse).not.toHaveBeenCalled();
  });

  it("does not schedule generation when the question cannot be created", async () => {
    mocks.createQuestion.mockResolvedValue({
      error: { code: "DATABASE_ERROR", message: "insert failed" },
      data: null,
    });

    const state = await askQuestionAction(
      RESEARCH_ID,
      initialState,
      formDataWith("What is the capital of France?")
    );

    expect(state.success).toBe(false);
    expect(state.formError).toContain("couldn't add your question");
    expect(mocks.runAfterResponse).not.toHaveBeenCalled();
  });

  it("rejects when the recent-question rate limit is reached", async () => {
    mocks.getRecentUserQuestionCount.mockResolvedValue({ error: null, data: 20 });

    const state = await askQuestionAction(
      RESEARCH_ID,
      initialState,
      formDataWith("What is the capital of France?")
    );

    expect(state.success).toBe(false);
    expect(state.formError).toContain("a lot of questions recently");
    expect(mocks.createQuestion).not.toHaveBeenCalled();
    expect(mocks.runAfterResponse).not.toHaveBeenCalled();
  });

  it("surfaces a sign-in error from the rate-limit lookup", async () => {
    mocks.getRecentUserQuestionCount.mockResolvedValue({
      error: { code: "UNAUTHORIZED", message: "Sign in required." },
      data: 0,
    });

    const state = await askQuestionAction(
      RESEARCH_ID,
      initialState,
      formDataWith("What is the capital of France?")
    );

    expect(state.success).toBe(false);
    expect(state.formError).toContain("signed in");
    expect(mocks.runAfterResponse).not.toHaveBeenCalled();
  });
});
