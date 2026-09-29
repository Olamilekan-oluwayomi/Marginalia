import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchRow, Supabase } from "@/lib/research/types";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/research/session", () => ({
  requireUser: mocks.requireUser,
}));

import {
  createResearch,
  deleteResearch,
  getResearchById,
  getResearchList,
  getResearchListWithCounts,
  updateResearch,
} from "@/lib/research/research";

const USER_ID = "user-1";
const RESEARCH_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_RESEARCH_ID = "22222222-2222-4222-8222-222222222222";

function makeResearch(overrides: Partial<ResearchRow> = {}): ResearchRow {
  return {
    id: RESEARCH_ID,
    user_id: USER_ID,
    title: "My research",
    description: "About rainfall.",
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

type ChainResult = { data: unknown; error: unknown };

function makeSupabase(options: {
  listResult?: ChainResult;
  maybeSingleResult?: ChainResult;
  insertResult?: ChainResult;
  updateResult?: ChainResult;
  deleteResult?: ChainResult;
  documentsRows?: { research_id: string }[];
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
  const updateResult = options.updateResult ?? { data: null, error: null };
  const deleteResult = options.deleteResult ?? { data: null, error: null };
  const documentsRows = options.documentsRows ?? [];

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "documents") {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: documentsRows, error: null }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue(listResult),
        eq: vi.fn().mockReturnValue({
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
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(updateResult),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(deleteResult),
          }),
        }),
      }),
    };
  });

  return { supabase: { from } as unknown as Supabase, from };
}

const UNAUTHORIZED_SESSION = { error: { code: "UNAUTHORIZED" } };
const AUTH_SESSION = { user: { id: USER_ID } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(AUTH_SESSION);
});

describe("getResearchList", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await getResearchList({} as Supabase);

    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(result.data).toEqual([]);
  });

  it("returns the user's research newest-updated first", async () => {
    const { supabase, from } = makeSupabase({
      listResult: {
        data: [makeResearch(), makeResearch({ id: OTHER_RESEARCH_ID })],
        error: null,
      },
    });

    const result = await getResearchList(supabase);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
    expect(from).toHaveBeenCalledWith("research");
  });

  it("maps a query failure to DATABASE_ERROR with an empty list", async () => {
    const { supabase } = makeSupabase({
      listResult: { data: null, error: { message: "connection refused" } },
    });

    const result = await getResearchList(supabase);

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.data).toEqual([]);
  });
});

describe("getResearchListWithCounts", () => {
  it("returns an empty list when there is no research", async () => {
    const { supabase, from } = makeSupabase({
      listResult: { data: [], error: null },
    });

    const result = await getResearchListWithCounts(supabase);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("tallies document counts per research", async () => {
    const { supabase } = makeSupabase({
      listResult: {
        data: [makeResearch(), makeResearch({ id: OTHER_RESEARCH_ID })],
        error: null,
      },
      documentsRows: [
        { research_id: RESEARCH_ID },
        { research_id: RESEARCH_ID },
        { research_id: OTHER_RESEARCH_ID },
      ],
    });

    const result = await getResearchListWithCounts(supabase);

    expect(result.error).toBeNull();
    const byId = new Map(
      result.data!.map((item) => [item.id, item.document_count]),
    );
    expect(byId.get(RESEARCH_ID)).toBe(2);
    expect(byId.get(OTHER_RESEARCH_ID)).toBe(1);
  });

  it("maps a count query failure to DATABASE_ERROR", async () => {
    const { supabase } = makeSupabase({
      listResult: { data: [makeResearch()], error: null },
      documentsRows: [],
    });
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;
    fromSpy.mockImplementation((table: string) => {
      if (table === "documents") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi
              .fn()
              .mockResolvedValue({ data: null, error: { message: "boom" } }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          order: vi
            .fn()
            .mockResolvedValue({ data: [makeResearch()], error: null }),
        }),
      };
    });

    const result = await getResearchListWithCounts(supabase);

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.data).toEqual([]);
  });
});

describe("getResearchById", () => {
  it("rejects an invalid research id", async () => {
    const result = await getResearchById({} as Supabase, "not-a-uuid");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await getResearchById({} as Supabase, RESEARCH_ID);
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("returns the research", async () => {
    const { supabase } = makeSupabase({
      maybeSingleResult: { data: makeResearch(), error: null },
    });

    const result = await getResearchById(supabase, RESEARCH_ID);

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(RESEARCH_ID);
  });

  it("maps a missing research to NOT_FOUND", async () => {
    const { supabase } = makeSupabase({
      maybeSingleResult: { data: null, error: null },
    });

    const result = await getResearchById(supabase, RESEARCH_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("createResearch", () => {
  it("rejects a missing title", async () => {
    const result = await createResearch({} as Supabase, {
      title: "  ",
      description: undefined,
    });

    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.message).toContain("Title is required");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await createResearch({} as Supabase, { title: "New" });
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("creates a research row owned by the session user with trimmed fields", async () => {
    const { supabase, from } = makeSupabase({
      insertResult: { data: makeResearch(), error: null },
    });

    const result = await createResearch(supabase, {
      title: "  My research  ",
      description: "  About rainfall.  ",
    });

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(RESEARCH_ID);
    const insertChain = from.mock.results[0].value.insert;
    expect(insertChain).toHaveBeenCalledWith({
      user_id: USER_ID,
      title: "My research",
      description: "About rainfall.",
    });
  });

  it("maps a query failure to DATABASE_ERROR", async () => {
    const { supabase } = makeSupabase({
      insertResult: { data: null, error: { message: "insert failed" } },
    });

    const result = await createResearch(supabase, { title: "New" });

    expect(result.error?.code).toBe("DATABASE_ERROR");
  });
});

describe("updateResearch", () => {
  it("rejects an invalid research id", async () => {
    const result = await updateResearch({} as Supabase, "not-a-uuid", {
      title: "New",
    });
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await updateResearch({} as Supabase, RESEARCH_ID, {
      title: "New",
    });
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("rejects an empty update", async () => {
    const result = await updateResearch({} as Supabase, RESEARCH_ID, {});
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.message).toContain("Nothing to update");
  });

  it("updates the provided fields", async () => {
    const { supabase, from } = makeSupabase({
      updateResult: {
        data: makeResearch({ title: "Renamed", description: null }),
        error: null,
      },
    });

    const result = await updateResearch(supabase, RESEARCH_ID, {
      title: " Renamed ",
      description: null,
    });

    expect(result.error).toBeNull();
    const updateChain = from.mock.results[0].value.update;
    expect(updateChain).toHaveBeenCalledWith({
      title: "Renamed",
      description: null,
    });
  });

  it("maps a missing research to NOT_FOUND", async () => {
    const { supabase } = makeSupabase({
      updateResult: { data: null, error: null },
    });

    const result = await updateResearch(supabase, RESEARCH_ID, {
      title: "New",
    });

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("deleteResearch", () => {
  it("rejects an invalid research id", async () => {
    const result = await deleteResearch({} as Supabase, "not-a-uuid");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await deleteResearch({} as Supabase, RESEARCH_ID);
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("deletes the research row", async () => {
    const { supabase, from } = makeSupabase({
      deleteResult: { data: { id: RESEARCH_ID }, error: null },
    });

    const result = await deleteResearch(supabase, RESEARCH_ID);

    expect(result.error).toBeNull();
    expect(from).toHaveBeenCalledWith("research");
  });

  it("maps a missing research to NOT_FOUND", async () => {
    const { supabase } = makeSupabase({
      deleteResult: { data: null, error: null },
    });

    const result = await deleteResearch(supabase, RESEARCH_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
