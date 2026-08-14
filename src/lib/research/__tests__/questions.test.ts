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
  createQuestion,
  deleteQuestion,
  getQuestionById,
  getQuestions,
  getRecentUserQuestionCount,
  tryTransitionQuestionStatus,
  updateQuestionStatus,
} from "@/lib/research/questions";

const USER_ID = "user-1";
const RESEARCH_ID = "11111111-1111-4111-8111-111111111111";
const QUESTION_ID = "22222222-2222-4222-8222-222222222222";

const UNAUTHORIZED_SESSION = { error: { code: "UNAUTHORIZED" } };
const AUTH_SESSION = { user: { id: USER_ID } };

function makeSupabase(options: {
  count: number | null;
  error: unknown;
}): {
  supabase: Supabase;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
} {
  const gte = vi.fn().mockResolvedValue({
    count: options.count,
    error: options.error,
  });
  const eq = vi.fn().mockReturnValue({ gte });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return { supabase: { from } as unknown as Supabase, eq, gte };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(AUTH_SESSION);
});

describe("getRecentUserQuestionCount", () => {
  it("returns the recent question count for the current user", async () => {
    const { supabase, eq, gte } = makeSupabase({
      count: 3,
      error: null,
    });

    const result = await getRecentUserQuestionCount(supabase, 5);

    expect(result.error).toBeNull();
    expect(result.data).toBe(3);
    expect(eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(gte).toHaveBeenCalledWith("created_at", expect.any(String));
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await getRecentUserQuestionCount({} as Supabase, 5);

    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(result.data).toBe(0);
  });

  it("maps a query failure to DATABASE_ERROR with a count of 0", async () => {
    const { supabase } = makeSupabase({
      count: null,
      error: { message: "connection refused" },
    });

    const result = await getRecentUserQuestionCount(supabase, 5);

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.data).toBe(0);
  });

  it("treats a missing count as 0", async () => {
    const { supabase } = makeSupabase({ count: null, error: null });

    const result = await getRecentUserQuestionCount(supabase, 5);

    expect(result.error).toBeNull();
    expect(result.data).toBe(0);
  });
});

function makeQuestionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: QUESTION_ID,
    research_id: RESEARCH_ID,
    user_id: USER_ID,
    question: "What is the capital of France?",
    include_web: false,
    answer_status: "pending",
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

type ChainResult = { data: unknown; error: unknown };

function makeQuerySupabase(options: {
  listResult?: ChainResult;
  maybeSingleResult?: ChainResult;
  insertResult?: ChainResult;
} = {}): {
  supabase: Supabase;
  from: ReturnType<typeof vi.fn>;
} {
  const listResult = options.listResult ?? { data: [], error: null };
  const maybeSingleResult = options.maybeSingleResult ?? { data: null, error: null };
  const insertResult = options.insertResult ?? { data: null, error: null };

  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue(listResult),
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
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
          }),
        }),
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
        }),
      }),
    }),
  });

  return { supabase: { from } as unknown as Supabase, from };
}

describe("getQuestions", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await getQuestions({} as Supabase, RESEARCH_ID);

    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(result.data).toEqual([]);
  });

  it("rejects an invalid research id", async () => {
    const result = await getQuestions({} as Supabase, "not-a-uuid");

    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns the questions for a research ordered by created_at", async () => {
    const { supabase } = makeQuerySupabase({
      listResult: { data: [makeQuestionRow()], error: null },
    });

    const result = await getQuestions(supabase, RESEARCH_ID);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  it("maps a query failure to DATABASE_ERROR with an empty list", async () => {
    const { supabase } = makeQuerySupabase({
      listResult: { data: null, error: { message: "boom" } },
    });

    const result = await getQuestions(supabase, RESEARCH_ID);

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.data).toEqual([]);
  });
});

describe("getQuestionById", () => {
  it("rejects an invalid question id", async () => {
    const result = await getQuestionById({} as Supabase, "not-a-uuid");

    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await getQuestionById({} as Supabase, QUESTION_ID);

    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("returns the question", async () => {
    const { supabase } = makeQuerySupabase({
      maybeSingleResult: { data: makeQuestionRow(), error: null },
    });

    const result = await getQuestionById(supabase, QUESTION_ID);

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(QUESTION_ID);
  });

  it("maps a missing question to NOT_FOUND", async () => {
    const { supabase } = makeQuerySupabase({ maybeSingleResult: { data: null, error: null } });

    const result = await getQuestionById(supabase, QUESTION_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("createQuestion", () => {
  it("rejects an invalid research id", async () => {
    const result = await createQuestion({} as Supabase, "not-a-uuid", {
      question: "Hi",
    });

    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a blank or oversized question", async () => {
    const blank = await createQuestion({} as Supabase, RESEARCH_ID, { question: "  " });
    expect(blank.error?.code).toBe("VALIDATION_ERROR");

    const oversized = await createQuestion({} as Supabase, RESEARCH_ID, {
      question: "x".repeat(1001),
    });
    expect(oversized.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await createQuestion({} as Supabase, RESEARCH_ID, {
      question: "Hi",
    });

    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("inserts a question owned by the session user with a trimmed question", async () => {
    const { supabase, from } = makeQuerySupabase({
      insertResult: { data: makeQuestionRow(), error: null },
    });

    const result = await createQuestion(supabase, RESEARCH_ID, {
      question: "  What is the capital of France?  ",
      includeWeb: true,
    });

    expect(result.error).toBeNull();
    const insert = from.mock.results[0].value.insert;
    expect(insert).toHaveBeenCalledWith({
      research_id: RESEARCH_ID,
      user_id: USER_ID,
      question: "What is the capital of France?",
      include_web: true,
    });
  });

  it("defaults include_web to false", async () => {
    const { supabase, from } = makeQuerySupabase({
      insertResult: { data: makeQuestionRow(), error: null },
    });

    await createQuestion(supabase, RESEARCH_ID, { question: "Hi" });

    const insert = from.mock.results[0].value.insert;
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ include_web: false })
    );
  });

  it("maps an insert failure to DATABASE_ERROR", async () => {
    const { supabase } = makeQuerySupabase({
      insertResult: { data: null, error: { message: "insert failed" } },
    });

    const result = await createQuestion(supabase, RESEARCH_ID, { question: "Hi" });

    expect(result.error?.code).toBe("DATABASE_ERROR");
  });
});

describe("updateQuestionStatus", () => {
  it("rejects an invalid status", async () => {
    const result = await updateQuestionStatus(
      {} as Supabase,
      QUESTION_ID,
      "not-a-status" as never
    );

    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await updateQuestionStatus({} as Supabase, QUESTION_ID, "generating");

    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("updates the answer status", async () => {
    const { supabase } = makeQuerySupabase({
      maybeSingleResult: { data: makeQuestionRow({ answer_status: "generating" }), error: null },
    });

    const result = await updateQuestionStatus(supabase, QUESTION_ID, "generating");

    expect(result.error).toBeNull();
    expect(result.data?.answer_status).toBe("generating");
  });

  it("maps a missing question to NOT_FOUND", async () => {
    const { supabase } = makeQuerySupabase({ maybeSingleResult: { data: null, error: null } });

    const result = await updateQuestionStatus(supabase, QUESTION_ID, "generating");

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("tryTransitionQuestionStatus", () => {
  it("rejects an empty from list", async () => {
    const result = await tryTransitionQuestionStatus({} as Supabase, QUESTION_ID, [], "generating");

    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.data.transitioned).toBe(false);
  });

  it("rejects an invalid from or to status", async () => {
    const badFrom = await tryTransitionQuestionStatus(
      {} as Supabase,
      QUESTION_ID,
      ["pending", "bogus" as never],
      "generating"
    );
    expect(badFrom.error?.code).toBe("VALIDATION_ERROR");

    const badTo = await tryTransitionQuestionStatus(
      {} as Supabase,
      QUESTION_ID,
      ["pending"],
      "bogus" as never
    );
    expect(badTo.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await tryTransitionQuestionStatus(
      {} as Supabase,
      QUESTION_ID,
      ["pending"],
      "generating"
    );

    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("reports a successful transition", async () => {
    const { supabase } = makeQuerySupabase({
      maybeSingleResult: { data: { id: QUESTION_ID }, error: null },
    });

    const result = await tryTransitionQuestionStatus(
      supabase,
      QUESTION_ID,
      ["pending", "failed"],
      "generating"
    );

    expect(result.error).toBeNull();
    expect(result.data.transitioned).toBe(true);
  });

  it("reports a lost transition race", async () => {
    const { supabase } = makeQuerySupabase({ maybeSingleResult: { data: null, error: null } });

    const result = await tryTransitionQuestionStatus(
      supabase,
      QUESTION_ID,
      ["pending"],
      "generating"
    );

    expect(result.error).toBeNull();
    expect(result.data.transitioned).toBe(false);
  });
});

describe("deleteQuestion", () => {
  it("rejects an invalid question id", async () => {
    const result = await deleteQuestion({} as Supabase, "not-a-uuid");

    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await deleteQuestion({} as Supabase, QUESTION_ID);

    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("deletes the question", async () => {
    const { supabase } = makeQuerySupabase({
      maybeSingleResult: { data: { id: QUESTION_ID }, error: null },
    });

    const result = await deleteQuestion(supabase, QUESTION_ID);

    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  it("maps a missing question to NOT_FOUND", async () => {
    const { supabase } = makeQuerySupabase({ maybeSingleResult: { data: null, error: null } });

    const result = await deleteQuestion(supabase, QUESTION_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
