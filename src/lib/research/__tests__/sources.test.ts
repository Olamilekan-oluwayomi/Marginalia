import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceRow, Supabase } from "@/lib/research/types";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/research/session", () => ({
  requireUser: mocks.requireUser,
}));

import {
  createSource,
  deleteSource,
  getSourceById,
} from "@/lib/research/sources";

const USER_ID = "user-1";
const RESEARCH_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_ID = "22222222-2222-4222-8222-222222222222";

function makeSource(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    id: SOURCE_ID,
    research_id: RESEARCH_ID,
    user_id: USER_ID,
    title: "Example paper",
    url: "https://example.com/paper",
    publisher: "Example Press",
    retrieved_at: "2026-08-13T00:00:00.000Z",
    content: "Body text.",
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
}): { supabase: Supabase; from: ReturnType<typeof vi.fn> } {
  const listResult = options.listResult ?? { data: [], error: null };
  const maybeSingleResult = options.maybeSingleResult ?? {
    data: null,
    error: null,
  };
  const insertResult = options.insertResult ?? {
    data: null,
    error: null,
  };
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
const AUTH_SESSION = { user: { id: USER_ID } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(AUTH_SESSION);
});

describe("getSourceById", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await getSourceById({} as Supabase, SOURCE_ID);

    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(result.data).toBeNull();
  });

  it("rejects an invalid source id", async () => {
    const result = await getSourceById({} as Supabase, "not-a-uuid");

    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns the source", async () => {
    const { supabase } = makeSupabase({
      maybeSingleResult: { data: makeSource(), error: null },
    });

    const result = await getSourceById(supabase, SOURCE_ID);

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(SOURCE_ID);
  });

  it("maps a missing source to NOT_FOUND", async () => {
    const { supabase } = makeSupabase({
      maybeSingleResult: { data: null, error: null },
    });

    const result = await getSourceById(supabase, SOURCE_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("deleteSource", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await deleteSource({} as Supabase, SOURCE_ID);

    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("rejects an invalid source id", async () => {
    const result = await deleteSource({} as Supabase, "not-a-uuid");

    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("deletes the source row", async () => {
    const { supabase, from } = makeSupabase({
      deleteResult: { data: { id: SOURCE_ID }, error: null },
    });

    const result = await deleteSource(supabase, SOURCE_ID);

    expect(result.error).toBeNull();
    expect(from).toHaveBeenCalledWith("sources");
  });

  it("maps a missing source to NOT_FOUND", async () => {
    const { supabase } = makeSupabase({
      deleteResult: { data: null, error: null },
    });

    const result = await deleteSource(supabase, SOURCE_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("createSource", () => {
  it("rejects a source whose URL already exists in the research", async () => {
    const { supabase, from } = makeSupabase({
      listResult: {
        data: [
          makeSource({
            id: "other-id",
            url: "https://example.com/paper?utm_source=newsletter",
          }),
        ],
        error: null,
      },
    });

    const result = await createSource(supabase, RESEARCH_ID, {
      title: "Duplicate paper",
      url: "https://example.com/paper/",
    });

    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.message).toContain("already in this research");
    expect(from).toHaveBeenCalledWith("sources");
    expect(from.mock.results[0].value.insert).not.toHaveBeenCalled();
  });

  it("allows a source with a genuinely distinct URL", async () => {
    const { supabase } = makeSupabase({
      listResult: {
        data: [
          makeSource({
            id: "other-id",
            url: "https://example.com/paper",
          }),
        ],
        error: null,
      },
      insertResult: { data: makeSource({ url: "https://other.org/paper" }), error: null },
    });

    const result = await createSource(supabase, RESEARCH_ID, {
      title: "Different paper",
      url: "https://other.org/paper",
    });

    expect(result.error).toBeNull();
    expect(result.data?.url).toBe("https://other.org/paper");
  });

  it("does not deduplicate non-web URL text values", async () => {
    const { supabase } = makeSupabase({
      listResult: {
        data: [makeSource({ id: "other-id", url: "local notes" })],
        error: null,
      },
      insertResult: { data: makeSource({ url: "local notes" }), error: null },
    });

    const result = await createSource(supabase, RESEARCH_ID, {
      title: "Second note",
      url: "local notes",
    });

    expect(result.error).toBeNull();
  });

  it("inserts when the URL is empty", async () => {
    const { supabase } = makeSupabase({
      insertResult: { data: makeSource({ url: null }), error: null },
    });

    const result = await createSource(supabase, RESEARCH_ID, {
      title: "No url",
    });

    expect(result.error).toBeNull();
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await createSource(supabaseStub(), RESEARCH_ID, {
      title: "Paper",
    });

    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("rejects an invalid research id", async () => {
    const result = await createSource(supabaseStub(), "not-a-uuid", {
      title: "Paper",
    });

    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });
});

function supabaseStub(): Supabase {
  return { from: vi.fn() } as unknown as Supabase;
}
