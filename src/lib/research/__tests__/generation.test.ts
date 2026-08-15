import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiError, isAiError } from "@/lib/ai/errors";
import type {
  ResearchQuestionRow,
  Supabase,
} from "@/lib/research/types";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getQuestionById: vi.fn(),
  tryTransitionQuestionStatus: vi.fn(),
  updateQuestionStatus: vi.fn(),
  retrieveResearchContext: vi.fn(),
  buildResearchPrompt: vi.fn(),
  generateJson: vi.fn(),
  createAnswer: vi.fn(),
  createCitation: vi.fn(),
  isAiError: vi.fn(),
  runWebResearch: vi.fn(),
  getDocuments: vi.fn(),
  checkDocumentRelevance: vi.fn(),
  detectExplicitSearchIntent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({
  DEFAULT_MODEL: "test-model",
  generateJson: mocks.generateJson,
  isAiError: mocks.isAiError,
}));
vi.mock("@/lib/research/answers", () => ({ createAnswer: mocks.createAnswer }));
vi.mock("@/lib/research/citations", () => ({
  createCitation: mocks.createCitation,
}));
vi.mock("@/lib/research/context", () => ({
  retrieveResearchContext: mocks.retrieveResearchContext,
  buildResearchPrompt: mocks.buildResearchPrompt,
}));
vi.mock("@/lib/research/questions", () => ({
  getQuestionById: mocks.getQuestionById,
  tryTransitionQuestionStatus: mocks.tryTransitionQuestionStatus,
  updateQuestionStatus: mocks.updateQuestionStatus,
}));
vi.mock("@/lib/research/web-research", () => ({
  runWebResearch: mocks.runWebResearch,
}));
vi.mock("@/lib/research/documents", () => ({
  getDocuments: mocks.getDocuments,
}));
vi.mock("@/lib/research/relevance-check", () => ({
  checkDocumentRelevance: mocks.checkDocumentRelevance,
  detectExplicitSearchIntent: mocks.detectExplicitSearchIntent,
}));
vi.mock("@/lib/research/session", () => ({ requireUser: mocks.requireUser }));

import { generateAnswer } from "@/lib/research/generation";

const question: ResearchQuestionRow = {
  id: "11111111-1111-1111-1111-111111111111",
  research_id: "22222222-2222-2222-2222-222222222222",
  user_id: "33333333-3333-3333-3333-333333333333",
  question: "What is the capital of France?",
  answer_status: "pending",
  include_web: false,
  created_at: "2026-08-13T00:00:00.000Z",
};

const fakeSupabase = {} as unknown as Supabase;

function makeReadyDocument(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    research_id: question.research_id,
    user_id: question.user_id,
    title: "The study PDF",
    file_name: "study.pdf",
    file_path: "study.pdf",
    mime_type: "application/pdf",
    file_size: 1000,
    status: "ready",
    content: "A trend analysis of extreme precipitation.",
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.isAiError.mockImplementation((error: unknown) => isAiError(error));
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getQuestionById.mockResolvedValue({ error: null, data: question });
  mocks.tryTransitionQuestionStatus.mockResolvedValue({
    error: null,
    data: { transitioned: true },
  });
  mocks.retrieveResearchContext.mockResolvedValue({
    error: null,
    data: { items: [], hasBodyContent: false },
  });
  mocks.runWebResearch.mockResolvedValue({
    error: null,
    data: { items: [], addedCount: 0 },
  });
  mocks.getDocuments.mockResolvedValue({ error: null, data: [] });
  mocks.detectExplicitSearchIntent.mockReturnValue(null);
  mocks.buildResearchPrompt.mockReturnValue("Research question:\nWhat is the capital of France?");
  mocks.generateJson.mockResolvedValue({
    answer: "Paris is the capital of France.",
    citations: [],
  });
  mocks.createAnswer.mockResolvedValue({
    error: null,
    data: {
      id: "44444444-4444-4444-4444-444444444444",
      question_id: question.id,
      research_id: question.research_id,
      content: "Paris is the capital of France.",
      model: "test-model",
      source_mode: "document",
      created_at: "2026-08-13T00:00:01.000Z",
    },
  });
  mocks.updateQuestionStatus.mockResolvedValue({ error: null, data: question });
});

describe("generateAnswer", () => {
  it("persists an answer and marks the question complete on success", async () => {
    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe("44444444-4444-4444-4444-444444444444");
    expect(mocks.createAnswer).toHaveBeenCalledOnce();
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({ source_mode: "document" })
    );
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "complete"
    );
  });

  it("marks the question failed and returns a safe error on an empty provider response", async () => {
    mocks.generateJson.mockRejectedValue(
      aiError("PROVIDER_ERROR", "The AI provider returned an empty response.")
    );

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.data).toBeNull();
    expect(mocks.createAnswer).not.toHaveBeenCalled();
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "failed"
    );
  });

  it("marks the question failed and returns a safe error on provider failure", async () => {
    mocks.generateJson.mockRejectedValue(
      aiError("PROVIDER_ERROR", "Provider exploded.")
    );

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.error?.message).toContain("try again");
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "failed"
    );
  });

  it("never persists an answer from malformed model output", async () => {
    mocks.generateJson.mockResolvedValue({ answer: "", citations: [] });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(mocks.createAnswer).not.toHaveBeenCalled();
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "failed"
    );
  });

  it("marks the question failed when the answer row cannot be created", async () => {
    mocks.createAnswer.mockResolvedValue({
      error: { code: "DATABASE_ERROR", message: "insert failed" },
      data: null,
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "failed"
    );
  });

  it("refuses to double-generate when the guarded transition loses", async () => {
    mocks.tryTransitionQuestionStatus.mockResolvedValue({
      error: null,
      data: { transitioned: false },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.message).toContain("already being generated");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });

  it("returns UNAUTHORIZED when the caller is not signed in", async () => {
    mocks.requireUser.mockResolvedValue({
      error: { code: "UNAUTHORIZED", message: "Sign in required." },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });

  it("rejects a question that does not belong to the supplied research", async () => {
    mocks.getQuestionById.mockResolvedValue({
      error: null,
      data: { ...question, research_id: "55555555-5555-5555-5555-555555555555" },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.message).toContain("does not belong");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });

  it("never starts generation when the question is not found", async () => {
    mocks.getQuestionById.mockResolvedValue({
      error: { code: "NOT_FOUND", message: "Question not found." },
      data: null,
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("NOT_FOUND");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });

  it("skips web research for questions that did not request it", async () => {
    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.runWebResearch).not.toHaveBeenCalled();
    expect(mocks.checkDocumentRelevance).not.toHaveBeenCalled();
  });

  it("falls back to web research and records a reason when the document is not relevant", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.checkDocumentRelevance.mockResolvedValue({
      relevant: false,
      confidence: 0.9,
      reason: "The document is about hydrology, not the weather in Tokyo.",
    });
    const webItem = {
      kind: "source",
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Tokyo weather report",
      content: "",
      metadata: {
        publisher: "Web search",
        url: "https://example.com/tokyo-weather",
      },
    } as const;
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [webItem], addedCount: 1 },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.checkDocumentRelevance).toHaveBeenCalledWith(
      question.question,
      expect.stringContaining("A trend analysis of extreme precipitation.")
    );
    expect(mocks.runWebResearch).toHaveBeenCalledWith(
      fakeSupabase,
      question.research_id,
      question.question
    );
    expect(mocks.buildResearchPrompt).toHaveBeenCalledWith(
      question.question,
      expect.objectContaining({
        items: expect.arrayContaining([webItem]),
      })
    );
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({
        fallback_reason: "This wasn't found in your document, so I searched the web instead.",
        source_mode: "web",
      })
    );
  });

  it("keeps the document path without web research when the document is relevant", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.checkDocumentRelevance.mockResolvedValue({
      relevant: true,
      confidence: 0.95,
      reason: "The document covers exactly this topic.",
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.checkDocumentRelevance).toHaveBeenCalledOnce();
    expect(mocks.runWebResearch).not.toHaveBeenCalled();
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({ fallback_reason: null, source_mode: "document" })
    );
  });

  it("passes full document content to the relevance check when under the ceiling", async () => {
    const content = "y".repeat(10_000);
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument({ content })],
    });
    mocks.checkDocumentRelevance.mockResolvedValue({
      relevant: true,
      confidence: 0.9,
      reason: "The document covers this.",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = await generateAnswer(fakeSupabase, {
        questionId: question.id,
        researchId: question.research_id,
      });

      expect(result.error).toBeNull();
      const [, summary] = mocks.checkDocumentRelevance.mock.calls[0];
      expect(summary).toBe(`The study PDF\n${content}`);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("caps a pathologically oversized document in the relevance summary", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument({ content: "x".repeat(60_000) })],
    });
    mocks.checkDocumentRelevance.mockResolvedValue({
      relevant: true,
      confidence: 1,
      reason: "The document covers this.",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = await generateAnswer(fakeSupabase, {
        questionId: question.id,
        researchId: question.research_id,
      });

      expect(result.error).toBeNull();
      const [, summary] = mocks.checkDocumentRelevance.mock.calls[0];
      expect(summary).toHaveLength(50_000);
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("honors an explicit web intent without running the relevance check", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.detectExplicitSearchIntent.mockReturnValue("web");

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.detectExplicitSearchIntent).toHaveBeenCalledWith(
      question.question
    );
    expect(mocks.checkDocumentRelevance).not.toHaveBeenCalled();
    expect(mocks.runWebResearch).toHaveBeenCalledOnce();
  });

  it("honors an explicit document intent without running the relevance check", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.detectExplicitSearchIntent.mockReturnValue("document");

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.checkDocumentRelevance).not.toHaveBeenCalled();
    expect(mocks.runWebResearch).not.toHaveBeenCalled();
  });

  it("treats a relevance-check failure as relevant and answers from the document", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.checkDocumentRelevance.mockRejectedValue(
      aiError("PROVIDER_ERROR", "Provider exploded.")
    );

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.runWebResearch).not.toHaveBeenCalled();
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({ fallback_reason: null, source_mode: "document" })
    );
  });

  it("runs web research and adds discovered items to the context when requested", async () => {
    mocks.getQuestionById.mockResolvedValue({
      error: null,
      data: { ...question, include_web: true },
    });
    const webItem = {
      kind: "source",
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      title: "Official Paris travel guide",
      content: "",
      metadata: {
        publisher: "Web search",
        url: "https://example.com/paris",
      },
    } as const;
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [webItem], addedCount: 1 },
    });
    mocks.buildResearchPrompt.mockReturnValue("Research question:\nWhat is the capital of France?");
    mocks.generateJson.mockResolvedValue({
      answer: "Paris is the capital of France.",
      citations: [],
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.runWebResearch).toHaveBeenCalledWith(
      fakeSupabase,
      question.research_id,
      question.question
    );
    expect(mocks.buildResearchPrompt).toHaveBeenCalledWith(
      question.question,
      expect.objectContaining({
        items: expect.arrayContaining([webItem]),
      })
    );
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({ source_mode: "web" })
    );
  });

  it("continues with local context when web research fails", async () => {
    mocks.getQuestionById.mockResolvedValue({
      error: null,
      data: { ...question, include_web: true },
    });
    mocks.runWebResearch.mockResolvedValue({
      error: { code: "PROVIDER_ERROR", message: "Web search failed." },
      data: null,
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.runWebResearch).toHaveBeenCalledOnce();
    expect(mocks.generateJson).toHaveBeenCalledOnce();
    expect(mocks.createAnswer).toHaveBeenCalledOnce();
  });

  it("persists a citation whose evidence resolves to the single context item", async () => {
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content: "alpha of 0.05 was used for every trend analysis.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
    mocks.generateJson.mockResolvedValue({
      answer: "A significance level of 0.05 was used [1].",
      citations: [{ citation_number: 1, evidence: 1 }],
    });
    mocks.createCitation.mockResolvedValue({ error: null, data: {} });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({
        content: "A significance level of 0.05 was used [1].",
        source_mode: "document",
      })
    );
    expect(mocks.createCitation).toHaveBeenCalledWith(
      expect.anything(),
      "44444444-4444-4444-4444-444444444444",
      expect.objectContaining({
        citation_number: 1,
        document_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        source_id: undefined,
        excerpt: "alpha of 0.05 was used for every trend analysis.",
      })
    );
  });

  it("does not persist a dropped citation and removes its marker from the saved answer", async () => {
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content: "alpha of 0.05 was used for every trend analysis.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
    mocks.generateJson.mockResolvedValue({
      answer: "A significance level of 0.05 was used [2].",
      citations: [{ citation_number: 2, evidence: 2 }],
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.createCitation).not.toHaveBeenCalled();
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({
        content: "A significance level of 0.05 was used.",
      })
    );
  });

  it("persists web citations from a document-plus-web answer as both mode", async () => {
    mocks.getQuestionById.mockResolvedValue({
      error: null,
      data: { ...question, include_web: true },
    });
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content: "alpha of 0.05 was used for every trend analysis.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
    const webItem = {
      kind: "source",
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      title: "Official climate guidance",
      content: "",
      metadata: {
        publisher: "Web search",
        url: "https://example.com/climate-guidance",
      },
    } as const;
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [webItem], addedCount: 1 },
    });
    mocks.generateJson.mockResolvedValue({
      answer:
        "The trend analysis used a 0.05 significance level [1]. Related guidance is available online [2].",
      citations: [
        { citation_number: 1, evidence: 1 },
        { citation_number: 2, evidence: 2 },
      ],
    });
    mocks.createCitation.mockResolvedValue({ error: null, data: {} });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({ source_mode: "both", fallback_reason: null })
    );
    expect(mocks.createCitation).toHaveBeenCalledWith(
      expect.anything(),
      "44444444-4444-4444-4444-444444444444",
      expect.objectContaining({
        citation_number: 2,
        document_id: undefined,
        source_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        excerpt: "Related guidance is available online [2].",
      })
    );
  });
});

describe("system prompt selection by source mode", () => {
  const documentItem = {
    kind: "document",
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    title: "The study PDF",
    content: "alpha of 0.05 was used for every trend analysis.",
    metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
  } as const;
  const webItem = {
    kind: "source",
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "Official climate guidance",
    content: "",
    metadata: {
      publisher: "Web search",
      url: "https://example.com/climate-guidance",
    },
  } as const;

  it("uses the document-mode prompt when the context is documents only", async () => {
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: { items: [documentItem], hasBodyContent: true },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    const args = mocks.generateJson.mock.calls[0][0] as { system: string };
    expect(args.system).toContain(
      "You are answering from the user's uploaded documents only."
    );
  });

  it("uses the web-mode prompt when the context is sources only", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.checkDocumentRelevance.mockResolvedValue({
      relevant: false,
      confidence: 0.9,
      reason: "The document is about hydrology, not this topic.",
    });
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [webItem], addedCount: 1 },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    const args = mocks.generateJson.mock.calls[0][0] as { system: string };
    expect(args.system).toContain("You are answering from web search results.");
  });

  it("uses the combined prompt when the context mixes documents and sources", async () => {
    mocks.getQuestionById.mockResolvedValue({
      error: null,
      data: { ...question, include_web: true },
    });
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: { items: [documentItem], hasBodyContent: true },
    });
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [webItem], addedCount: 1 },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    const args = mocks.generateJson.mock.calls[0][0] as { system: string };
    expect(args.system).toContain(
      "You are answering from the user's uploaded documents and web search results together."
    );
  });
});
