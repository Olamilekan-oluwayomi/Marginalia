import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Supabase } from "@/lib/research/types";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/research/session", () => ({
  requireUser: mocks.requireUser,
}));

import {
  createAnswer,
  deleteAnswer,
  getAnswerWithCitations,
  getAnswers,
} from "@/lib/research/answers";

const QUESTION_ID = "11111111-1111-4111-8111-111111111111";
const RESEARCH_ID = "22222222-2222-4222-8222-222222222222";
const ANSWER_ID = "33333333-3333-4333-8333-333333333333";

function makeAnswer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ANSWER_ID,
    question_id: QUESTION_ID,
    research_id: RESEARCH_ID,
    content: "The answer body.",
    model: "test-model",
    source_mode: "document",
    created_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

type ChainResult = { data: unknown; error: unknown };

function makeSupabase(options: {
  listResult?: ChainResult;
  maybeSingleResult?: ChainResult;
  insertResult?: ChainResult;
  deleteResult?: ChainResult;
}): {
  supabase: Supabase;
  from: ReturnType<typeof vi.fn>;
} {
  const listResult = options.listResult ?? { data: [], error: null };
  const maybeSingleResult = options.maybeSingleResult ?? {
    data: null,
    error: null,
  };
  const insertResult = options.insertResult ?? { data: null, error: null };
  const deleteResult = options.deleteResult ?? { data: null, error: null };

  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue(listResult),
        maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(insertResult),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue(deleteResult),
        }),
      }),
    }),
  });

  return { supabase: { from } as unknown as Supabase, from };
}

const UNAUTHORIZED_SESSION = { error: { code: "UNAUTHORIZED" } };
const AUTH_SESSION = { user: { id: "user-1" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(AUTH_SESSION);
});

describe("getAnswers", () => {
  it("rejects an invalid question id", async () => {
    const result = await getAnswers({} as Supabase, "not-a-uuid");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.data).toEqual([]);
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await getAnswers({} as Supabase, QUESTION_ID);
    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(result.data).toEqual([]);
  });

  it("returns the answers for a question ordered by created_at", async () => {
    const { supabase, from } = makeSupabase({
      listResult: { data: [makeAnswer()], error: null },
    });

    const result = await getAnswers(supabase, QUESTION_ID);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(from).toHaveBeenCalledWith("answers");
  });

  it("maps a query failure to DATABASE_ERROR with an empty list", async () => {
    const { supabase } = makeSupabase({
      listResult: { data: null, error: { message: "boom" } },
    });

    const result = await getAnswers(supabase, QUESTION_ID);

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.data).toEqual([]);
  });
});

describe("getAnswerWithCitations", () => {
  it("rejects an invalid answer id", async () => {
    const result = await getAnswerWithCitations({} as Supabase, "not-a-uuid");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await getAnswerWithCitations({} as Supabase, ANSWER_ID);
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("returns an answer with its citations attached", async () => {
    const { supabase, from } = makeSupabase({
      maybeSingleResult: {
        data: makeAnswer({
          citations: [{ id: "c1", answer_id: ANSWER_ID, citation_number: 1 }],
        }),
        error: null,
      },
    });

    const result = await getAnswerWithCitations(supabase, ANSWER_ID);

    expect(result.error).toBeNull();
    expect(result.data!.citations).toHaveLength(1);
    expect(from).toHaveBeenCalledWith("answers");
  });

  it("maps a missing answer to NOT_FOUND", async () => {
    const { supabase } = makeSupabase({ maybeSingleResult: { data: null, error: null } });

    const result = await getAnswerWithCitations(supabase, ANSWER_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
    expect(result.data).toBeNull();
  });
});

describe("createAnswer", () => {
  it("rejects invalid question and research ids", async () => {
    const result = await createAnswer({} as Supabase, "bad", RESEARCH_ID, {
      content: "body",
    });
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty content", async () => {
    const result = await createAnswer({} as Supabase, QUESTION_ID, RESEARCH_ID, {
      content: "   ",
    });
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.message).toContain("Content is required");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await createAnswer({} as Supabase, QUESTION_ID, RESEARCH_ID, {
      content: "body",
    });
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("inserts a trimmed answer with the model default", async () => {
    const { supabase, from } = makeSupabase({
      insertResult: { data: makeAnswer(), error: null },
    });

    const result = await createAnswer(supabase, QUESTION_ID, RESEARCH_ID, {
      content: "  body text  ",
      model: undefined,
    });

    expect(result.error).toBeNull();
    const insertChain = from.mock.results[0].value.insert;
    expect(insertChain).toHaveBeenCalledWith({
      question_id: QUESTION_ID,
      research_id: RESEARCH_ID,
      content: "body text",
      model: null,
      fallback_reason: null,
      source_mode: "document",
    });
    expect(result.data?.id).toBe(ANSWER_ID);
  });

  it("inserts a trimmed fallback reason when provided", async () => {
    const { supabase, from } = makeSupabase({
      insertResult: { data: makeAnswer(), error: null },
    });

    const result = await createAnswer(supabase, QUESTION_ID, RESEARCH_ID, {
      content: "body text",
      fallback_reason: "  This wasn't found in your document.  ",
    });

    expect(result.error).toBeNull();
    const insertChain = from.mock.results[0].value.insert;
    expect(insertChain).toHaveBeenCalledWith({
      question_id: QUESTION_ID,
      research_id: RESEARCH_ID,
      content: "body text",
      model: null,
      fallback_reason: "This wasn't found in your document.",
      source_mode: "document",
    });
    expect(result.data?.id).toBe(ANSWER_ID);
  });

  it("inserts the requested source mode", async () => {
    const { supabase, from } = makeSupabase({
      insertResult: { data: makeAnswer({ source_mode: "web" }), error: null },
    });

    const result = await createAnswer(supabase, QUESTION_ID, RESEARCH_ID, {
      content: "body text",
      source_mode: "web",
    });

    expect(result.error).toBeNull();
    const insertChain = from.mock.results[0].value.insert;
    expect(insertChain).toHaveBeenCalledWith(
      expect.objectContaining({ source_mode: "web" })
    );
  });

  it("rejects an invalid source mode", async () => {
    const result = await createAnswer({} as Supabase, QUESTION_ID, RESEARCH_ID, {
      content: "body text",
      source_mode: "vhs" as never,
    });
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("maps a query failure to DATABASE_ERROR", async () => {
    const { supabase } = makeSupabase({
      insertResult: { data: null, error: { message: "insert failed" } },
    });

    const result = await createAnswer(supabase, QUESTION_ID, RESEARCH_ID, {
      content: "body",
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
  });
});

describe("deleteAnswer", () => {
  it("rejects an invalid answer id", async () => {
    const result = await deleteAnswer({} as Supabase, "not-a-uuid");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await deleteAnswer({} as Supabase, ANSWER_ID);
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("deletes the answer row", async () => {
    const { supabase } = makeSupabase({
      deleteResult: { data: { id: ANSWER_ID }, error: null },
    });

    const result = await deleteAnswer(supabase, ANSWER_ID);

    expect(result.error).toBeNull();
  });

  it("maps a missing answer to NOT_FOUND", async () => {
    const { supabase } = makeSupabase({ deleteResult: { data: null, error: null } });

    const result = await deleteAnswer(supabase, ANSWER_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
