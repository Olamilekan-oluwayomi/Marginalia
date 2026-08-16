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
  groqGenerate: vi.fn(),
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
vi.mock("@/lib/research/providers/groq", () => ({
  GroqAnswerProvider: class {
    generate = mocks.groqGenerate;
  },
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

function makeWebItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: "source",
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    title: "Web search result",
    content: "",
    metadata: {
      publisher: "Web search",
      url: "https://example.com/web-result",
    },
    ...overrides,
  } as const;
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
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });

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
      // No document is attached, so the question routes to the web; with a
      // successful web search the answer is labeled "web".
      expect.objectContaining({ source_mode: "web" })
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
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });

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
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });

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
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });

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
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
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

  it("runs web research automatically when no document is attached", async () => {
    const webItem = {
      kind: "source",
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Paris weather report",
      content: "",
      metadata: {
        publisher: "Web search",
        url: "https://example.com/paris-weather",
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
    expect(mocks.runWebResearch).toHaveBeenCalledOnce();
    expect(mocks.runWebResearch).toHaveBeenCalledWith(
      fakeSupabase,
      question.research_id,
      question.question
    );
    expect(mocks.checkDocumentRelevance).not.toHaveBeenCalled();
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
    expect(mocks.runWebResearch).toHaveBeenCalledOnce();
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

  it("excludes the rejected document from the context when falling back, so source_mode is web, not both", async () => {
    // Production shape: the workspace context carries the ready document, and
    // the relevance check rejects it. The document must not remain "offered
    // evidence" for sourceModeOf, or the answer would be labeled "both" next
    // to a fallback reason that says the document was not used.
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content: "A trend analysis of extreme precipitation.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
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
    mocks.generateJson.mockResolvedValue({
      answer: "Tokyo is forecast to see heavy rain [1].",
      citations: [{ citation_number: 1, evidence: 1 }],
    });
    mocks.createCitation.mockResolvedValue({ error: null, data: {} });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.buildResearchPrompt).toHaveBeenCalledWith(
      question.question,
      expect.objectContaining({
        items: [webItem],
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
    expect(mocks.createCitation).toHaveBeenCalledWith(
      expect.anything(),
      "44444444-4444-4444-4444-444444444444",
      expect.objectContaining({
        citation_number: 1,
        document_id: undefined,
        source_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      })
    );
  });

  it("keeps the document path without web research when the document is relevant", async () => {
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content: "A trend analysis of extreme precipitation.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
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
    const content = "y".repeat(3_000);
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content,
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
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
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content: "x".repeat(60_000),
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
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
      expect(summary).toHaveLength(4_000);
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("honors an explicit web intent without running the relevance check", async () => {
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content: "A trend analysis of extreme precipitation.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.detectExplicitSearchIntent.mockReturnValue("web");
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });

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
    expect(mocks.buildResearchPrompt).toHaveBeenCalledWith(
      question.question,
      expect.objectContaining({
        items: expect.not.arrayContaining([
          expect.objectContaining({ kind: "document" }),
        ]),
      })
    );
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({ source_mode: "web" })
    );
  });

  it("honors an explicit document intent without running the relevance check", async () => {
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content: "A trend analysis of extreme precipitation.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
          {
            kind: "source",
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            title: "User-pasted note",
            content: "Hand-written notes about the topic.",
            metadata: { publisher: "example.org", url: "https://example.org" },
          },
        ],
        hasBodyContent: true,
      },
    });
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
    expect(mocks.buildResearchPrompt).toHaveBeenCalledWith(
      question.question,
      expect.objectContaining({
        items: [
          expect.objectContaining({
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          }),
        ],
      })
    );
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({ fallback_reason: null, source_mode: "document" })
    );
  });

  it("treats a relevance-check failure as relevant and answers from the document", async () => {
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content: "A trend analysis of extreme precipitation.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
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

  it("runs web research web-only when the checkbox is on, even with a document attached", async () => {
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
            content: "A trend analysis of extreme precipitation.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
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
    expect(mocks.checkDocumentRelevance).not.toHaveBeenCalled();
    expect(mocks.buildResearchPrompt).toHaveBeenCalledWith(
      question.question,
      expect.objectContaining({
        items: expect.arrayContaining([webItem]),
      })
    );
    expect(mocks.buildResearchPrompt).toHaveBeenCalledWith(
      question.question,
      expect.not.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ kind: "document" }),
        ]),
      })
    );
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({ source_mode: "web" })
    );
  });

  it("runs web research web-only when the checkbox is on and no document is attached", async () => {
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

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.runWebResearch).toHaveBeenCalledOnce();
    expect(mocks.checkDocumentRelevance).not.toHaveBeenCalled();
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
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [makeWebItem()],
        hasBodyContent: false,
      },
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

  it("runs web research when the question asks for the document but none is attached", async () => {
    mocks.detectExplicitSearchIntent.mockReturnValue("document");
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    // No ready document exists, so an explicit "use the document" instruction
    // cannot be honored: the web is searched automatically instead.
    expect(mocks.runWebResearch).toHaveBeenCalledOnce();
    expect(mocks.checkDocumentRelevance).not.toHaveBeenCalled();
  });

  it("logs a web-search failure and continues from local context when the document is not relevant", async () => {
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "source",
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            title: "User-pasted note",
            content: "Local notes that survive the fallback.",
            metadata: { publisher: "example.org", url: "https://example.org" },
          },
        ],
        hasBodyContent: true,
      },
    });
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
      error: { code: "PROVIDER_ERROR", message: "Web search failed." },
      data: null,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await generateAnswer(fakeSupabase, {
        questionId: question.id,
        researchId: question.research_id,
      });

      expect(result.error).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        "[research] webSearch failed:",
        "Web search failed."
      );
      expect(mocks.buildResearchPrompt).toHaveBeenCalledWith(
        question.question,
        expect.objectContaining({
          items: [
            expect.objectContaining({
              kind: "source",
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            }),
          ],
        })
      );
      expect(mocks.createAnswer).toHaveBeenCalledWith(
        expect.anything(),
        question.id,
        question.research_id,
        expect.objectContaining({
          fallback_reason:
            "This wasn't found in your document, so I searched the web instead.",
        })
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("logs the actual underlying error when generation fails with a plain object", async () => {
    mocks.generateJson.mockRejectedValue({ detail: "provider exploded" });
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await generateAnswer(fakeSupabase, {
        questionId: question.id,
        researchId: question.research_id,
      });

      expect(result.error?.code).toBe("DATABASE_ERROR");
      const logged = errorSpy.mock.calls
        .map((call) => call.join(" "))
        .find((line) => line.includes("answer generation failed"));
      expect(logged).toBeDefined();
      expect(logged).not.toContain("[object Object]");
      expect(logged).toContain("provider exploded");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("logs the provider message when generation fails with an AI error", async () => {
    mocks.generateJson.mockRejectedValue(
      aiError("PROVIDER_ERROR", "Provider exploded.")
    );
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await generateAnswer(fakeSupabase, {
        questionId: question.id,
        researchId: question.research_id,
      });

      expect(result.error?.code).toBe("DATABASE_ERROR");
      expect(result.error?.message).toContain("try again");
      expect(errorSpy).toHaveBeenCalledWith(
        "[research-data] answer generation failed:",
        "Provider exploded."
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("fails an irrelevant-document question when the web fallback returns no results", async () => {
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content: "A trend analysis of extreme precipitation.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.checkDocumentRelevance.mockResolvedValue({
      relevant: false,
      confidence: 0.9,
      reason: "The document says nothing about rainforests.",
    });
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [], addedCount: 0 },
    });
    mocks.updateQuestionStatus.mockResolvedValue({ error: null, data: null });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.error?.message).toContain("web sources");
    expect(mocks.runWebResearch).toHaveBeenCalledOnce();
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(mocks.createAnswer).not.toHaveBeenCalled();
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "failed"
    );
  });

  it("fails a question when no document is attached and web research returns no results", async () => {
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [], addedCount: 0 },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.error?.message).toContain("web sources");
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(mocks.createAnswer).not.toHaveBeenCalled();
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "failed"
    );
  });

  it("fails a question when no document is attached and web research fails at the provider", async () => {
    mocks.runWebResearch.mockResolvedValue({
      error: { code: "PROVIDER_ERROR", message: "Web search failed." },
      data: null,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await generateAnswer(fakeSupabase, {
        questionId: question.id,
        researchId: question.research_id,
      });

      expect(result.error?.code).toBe("DATABASE_ERROR");
      expect(result.error?.message).toContain("web sources");
      expect(errorSpy).toHaveBeenCalledWith(
        "[research] webSearch failed:",
        "Web search failed."
      );
      expect(mocks.generateJson).not.toHaveBeenCalled();
      expect(mocks.createAnswer).not.toHaveBeenCalled();
      expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
        expect.anything(),
        question.id,
        "failed"
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("generates a web-only answer with a persisted web citation when no document is attached", async () => {
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });
    mocks.generateJson.mockResolvedValue({
      answer: "The capital of France is Paris [1].",
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
        content: "The capital of France is Paris [1].",
        source_mode: "web",
        fallback_reason: null,
      })
    );
    expect(mocks.createCitation).toHaveBeenCalledWith(
      expect.anything(),
      "44444444-4444-4444-4444-444444444444",
      expect.objectContaining({
        citation_number: 1,
        document_id: undefined,
        source_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        excerpt: "The capital of France is Paris [1].",
      })
    );
  });

  it("fails a checkbox-on question when web research returns no results", async () => {
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
            content: "A trend analysis of extreme precipitation.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [], addedCount: 0 },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.error?.message).toContain("web sources");
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(mocks.createAnswer).not.toHaveBeenCalled();
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "failed"
    );
  });

  it("answers from the document when an explicit both intent runs but web research returns no results", async () => {
    mocks.detectExplicitSearchIntent.mockReturnValue("both");
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: {
        items: [
          {
            kind: "document",
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            title: "The study PDF",
            content: "A trend analysis of extreme precipitation.",
            metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
          },
        ],
        hasBodyContent: true,
      },
    });
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [], addedCount: 0 },
    });
    mocks.generateJson.mockResolvedValue({
      answer: "The study found a significant trend.",
      citations: [],
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.generateJson).toHaveBeenCalledOnce();
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

  it("persists web citations from an explicit both-intent answer as both mode", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.detectExplicitSearchIntent.mockReturnValue("both");
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
    expect(mocks.runWebResearch).toHaveBeenCalledOnce();
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

  it("uses the combined prompt for an explicit both intent", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.detectExplicitSearchIntent.mockReturnValue("both");
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

  it("uses the web prompt for a checkbox-on question even when a document is attached", async () => {
    mocks.getQuestionById.mockResolvedValue({
      error: null,
      data: { ...question, include_web: true },
    });
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
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
    expect(mocks.checkDocumentRelevance).not.toHaveBeenCalled();
    const args = mocks.generateJson.mock.calls[0][0] as { system: string };
    expect(args.system).toContain("You are answering from web search results.");
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({ source_mode: "web" })
    );
  });
});

describe("answer generation fallback", () => {
  it("falls back to Groq on a 429 primary failure and persists the fallback answer", async () => {
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });
    mocks.generateJson.mockRejectedValue({
      code: "PROVIDER_ERROR",
      message: "Rate limit exceeded.",
      status: 429,
    });
    mocks.groqGenerate.mockResolvedValue({
      answer: "Paris is the capital of France.",
      citations: [],
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.generateJson).toHaveBeenCalledOnce();
    expect(mocks.groqGenerate).toHaveBeenCalledOnce();
    // Research is never re-run for the fallback: the exact same input is
    // retried as-is.
    expect(mocks.groqGenerate.mock.calls[0][0]).toEqual(
      mocks.generateJson.mock.calls[0][0]
    );
    expect(mocks.runWebResearch).toHaveBeenCalledOnce();
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({ source_mode: "web" })
    );
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "complete"
    );
  });

  it("falls back on a 503 primary failure", async () => {
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });
    mocks.generateJson.mockRejectedValue({
      code: "PROVIDER_ERROR",
      message: "Unavailable.",
      status: 503,
    });
    mocks.groqGenerate.mockResolvedValue({
      answer: "Paris is the capital of France.",
      citations: [],
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.groqGenerate).toHaveBeenCalledOnce();
  });

  it("falls back on a transient RPC code", async () => {
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });
    mocks.generateJson.mockRejectedValue({
      code: "PROVIDER_ERROR",
      message: "Quota exhausted.",
      rpcCode: "RESOURCE_EXHAUSTED",
    });
    mocks.groqGenerate.mockResolvedValue({
      answer: "Paris is the capital of France.",
      citations: [],
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.groqGenerate).toHaveBeenCalledOnce();
  });

  it("does not fall back on a permanent primary failure", async () => {
    mocks.generateJson.mockRejectedValue(
      aiError("PROVIDER_ERROR", "Provider exploded.")
    );
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(mocks.groqGenerate).not.toHaveBeenCalled();
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "failed"
    );
  });

  it("does not fall back on a permanent RPC code", async () => {
    mocks.generateJson.mockRejectedValue({
      code: "PROVIDER_ERROR",
      message: "Bad request.",
      rpcCode: "INVALID_ARGUMENT",
    });
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(mocks.groqGenerate).not.toHaveBeenCalled();
  });

  it("never invokes the fallback when the primary provider succeeds", async () => {
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.generateJson).toHaveBeenCalledOnce();
    expect(mocks.groqGenerate).not.toHaveBeenCalled();
  });

  it("fails the question with a safe error when the fallback also fails", async () => {
    mocks.runWebResearch.mockResolvedValue({
      error: null,
      data: { items: [makeWebItem()], addedCount: 1 },
    });
    mocks.generateJson.mockRejectedValue({
      code: "PROVIDER_ERROR",
      message: "Rate limit exceeded.",
      status: 429,
    });
    mocks.groqGenerate.mockRejectedValue(
      aiError("PROVIDER_ERROR", "Groq exploded.")
    );

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.error?.message).toContain("try again");
    expect(mocks.createAnswer).not.toHaveBeenCalled();
    expect(mocks.groqGenerate).toHaveBeenCalledOnce();
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "failed"
    );
  });

  it("resolves document citations from a fallback answer", async () => {
    const documentItem = {
      kind: "document",
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      title: "The study PDF",
      content: "alpha of 0.05 was used for every trend analysis.",
      metadata: { file_name: "study.pdf", mime_type: "application/pdf" },
    } as const;
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeReadyDocument()],
    });
    mocks.detectExplicitSearchIntent.mockReturnValue("document");
    mocks.retrieveResearchContext.mockResolvedValue({
      error: null,
      data: { items: [documentItem], hasBodyContent: true },
    });
    mocks.generateJson.mockRejectedValue({
      code: "PROVIDER_ERROR",
      message: "Rate limit exceeded.",
      status: 429,
    });
    mocks.groqGenerate.mockResolvedValue({
      answer: "The analysis used a 0.05 significance level [1].",
      citations: [{ citation_number: 1, evidence: 1 }],
    });
    mocks.createCitation.mockResolvedValue({ error: null, data: {} });

    const result = await generateAnswer(fakeSupabase, {
      questionId: question.id,
      researchId: question.research_id,
    });

    expect(result.error).toBeNull();
    expect(mocks.groqGenerate).toHaveBeenCalledOnce();
    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      question.research_id,
      expect.objectContaining({ source_mode: "document" })
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
    expect(mocks.updateQuestionStatus).toHaveBeenCalledWith(
      expect.anything(),
      question.id,
      "complete"
    );
  });
});
