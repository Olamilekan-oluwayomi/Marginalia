import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Supabase } from "@/lib/research/types";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/research/session", () => ({
  requireUser: mocks.requireUser,
}));

import { createCitation, getCitations } from "@/lib/research/citations";

const ANSWER_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";

function makeCitation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    answer_id: ANSWER_ID,
    citation_number: 1,
    document_id: DOCUMENT_ID,
    source_id: null,
    excerpt: null,
    created_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

type ChainResult = { data: unknown; error: unknown };

function makeSupabase(options: {
  listResult?: ChainResult;
  insertResult?: ChainResult;
}): {
  supabase: Supabase;
  from: ReturnType<typeof vi.fn>;
} {
  const listResult = options.listResult ?? { data: [], error: null };
  const insertResult = options.insertResult ?? { data: null, error: null };

  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue(listResult),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(insertResult),
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

describe("getCitations", () => {
  it("rejects an invalid answer id", async () => {
    const result = await getCitations({} as Supabase, "not-a-uuid");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.data).toEqual([]);
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await getCitations({} as Supabase, ANSWER_ID);
    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(result.data).toEqual([]);
  });

  it("returns the citations for an answer ordered by citation_number", async () => {
    const { supabase, from } = makeSupabase({
      listResult: {
        data: [makeCitation(), makeCitation({ citation_number: 2 })],
        error: null,
      },
    });

    const result = await getCitations(supabase, ANSWER_ID);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
    expect(from).toHaveBeenCalledWith("citations");
  });

  it("maps a query failure to DATABASE_ERROR with an empty list", async () => {
    const { supabase } = makeSupabase({
      listResult: { data: null, error: { message: "boom" } },
    });

    const result = await getCitations(supabase, ANSWER_ID);

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.data).toEqual([]);
  });
});

describe("createCitation", () => {
  it("rejects an invalid answer id", async () => {
    const result = await createCitation({} as Supabase, "not-a-uuid", {
      citation_number: 1,
      document_id: DOCUMENT_ID,
    });
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a citation number below 1", async () => {
    const result = await createCitation({} as Supabase, ANSWER_ID, {
      citation_number: 0,
      document_id: DOCUMENT_ID,
    });
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.message).toContain("at least 1");
  });

  it("requires exactly one of document_id or source_id", async () => {
    const both = await createCitation({} as Supabase, ANSWER_ID, {
      citation_number: 1,
      document_id: DOCUMENT_ID,
      source_id: SOURCE_ID,
    });
    expect(both.error?.code).toBe("VALIDATION_ERROR");
    expect(both.error?.message).toContain("exactly one");

    const neither = await createCitation({} as Supabase, ANSWER_ID, {
      citation_number: 1,
    });
    expect(neither.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid linked id", async () => {
    const result = await createCitation({} as Supabase, ANSWER_ID, {
      citation_number: 1,
      document_id: "not-a-uuid",
    });
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await createCitation({} as Supabase, ANSWER_ID, {
      citation_number: 1,
      document_id: DOCUMENT_ID,
    });
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("inserts a citation for a document link", async () => {
    const { supabase, from } = makeSupabase({
      insertResult: { data: makeCitation(), error: null },
    });

    const result = await createCitation(supabase, ANSWER_ID, {
      citation_number: 1,
      document_id: DOCUMENT_ID,
      excerpt: "  quoted text  ",
    });

    expect(result.error).toBeNull();
    const insertChain = from.mock.results[0].value.insert;
    expect(insertChain).toHaveBeenCalledWith({
      answer_id: ANSWER_ID,
      document_id: DOCUMENT_ID,
      source_id: null,
      citation_number: 1,
      excerpt: "quoted text",
    });
    expect(result.data?.id).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("inserts a citation for a source link", async () => {
    const { supabase } = makeSupabase({
      insertResult: {
        data: makeCitation({ source_id: SOURCE_ID, document_id: null }),
        error: null,
      },
    });

    const result = await createCitation(supabase, ANSWER_ID, {
      citation_number: 2,
      source_id: SOURCE_ID,
    });

    expect(result.error).toBeNull();
    expect(result.data?.source_id).toBe(SOURCE_ID);
  });

  it("maps a query failure to DATABASE_ERROR", async () => {
    const { supabase } = makeSupabase({
      insertResult: { data: null, error: { message: "insert failed" } },
    });

    const result = await createCitation(supabase, ANSWER_ID, {
      citation_number: 1,
      document_id: DOCUMENT_ID,
    });

    expect(result.error?.code).toBe("DATABASE_ERROR");
  });
});
