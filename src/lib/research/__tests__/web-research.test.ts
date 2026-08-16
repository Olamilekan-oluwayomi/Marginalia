import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Supabase } from "@/lib/research/types";
import type { WebSearchResult } from "@/lib/search";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  searchWeb: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/research/session", () => ({
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/search", () => ({
  searchWeb: mocks.searchWeb,
}));

import { runWebResearch } from "@/lib/research/web-research";

const RESEARCH_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";

const UNAUTHORIZED_SESSION = { error: { code: "UNAUTHORIZED" } };
const AUTH_SESSION = { user: { id: "user-1" } };

function makeSource(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SOURCE_ID,
    research_id: RESEARCH_ID,
    user_id: "user-1",
    title: "Some page",
    url: "https://example.com/page",
    publisher: "Web search",
    retrieved_at: "2026-08-13T00:00:00.000Z",
    content: null,
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

type ChainResult = { data: unknown; error: unknown };

function makeSupabase(options: {
  listResult?: ChainResult;
  insertResults?: ChainResult[];
} = {}): {
  supabase: Supabase;
  insertCalls: ReturnType<typeof vi.fn>;
} {
  const listResult = options.listResult ?? { data: [], error: null };
  const insertResults = options.insertResults ?? [{ data: null, error: null }];

  const insert = vi.fn().mockImplementation(() => {
    const next = insertResults.shift() ?? { data: null, error: null };
    return {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(next),
      }),
    };
  });
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue(listResult),
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue(listResult),
      }),
    }),
    insert,
  });

  return { supabase: { from } as unknown as Supabase, insertCalls: insert };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(AUTH_SESSION);
  mocks.searchWeb.mockResolvedValue([]);
});

describe("runWebResearch", () => {
  it("rejects an invalid research id", async () => {
    const result = await runWebResearch({} as Supabase, "not-a-uuid", "q");

    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.data).toEqual({ items: [], addedCount: 0 });
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await runWebResearch({} as Supabase, RESEARCH_ID, "q");

    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("fails softly when the source lookup fails", async () => {
    const { supabase } = makeSupabase({
      listResult: { data: null, error: { message: "boom" } },
    });

    const result = await runWebResearch(supabase, RESEARCH_ID, "q");

    expect(result.error?.code).toBe("DATABASE_ERROR");
  });

  it("returns an empty payload when the search returns no results", async () => {
    const { supabase } = makeSupabase();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const result = await runWebResearch(supabase, RESEARCH_ID, "q");

      expect(result.error).toBeNull();
      expect(result.data).toEqual({ items: [], addedCount: 0 });
      expect(mocks.searchWeb).toHaveBeenCalledWith("q");
      expect(
        logSpy.mock.calls.some((call) =>
          call.join(" ").includes("[research] webSearch:provider_empty")
        )
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("surfaces a real search failure instead of silently converting it to an empty success", async () => {
    mocks.searchWeb.mockRejectedValue(new Error("provider down"));
    const { supabase } = makeSupabase();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await runWebResearch(supabase, RESEARCH_ID, "q");

      expect(result.error?.code).toBe("DATABASE_ERROR");
      expect(result.data).toEqual({ items: [], addedCount: 0 });
      const logged = errorSpy.mock.calls
        .map((call) => call.join(" "))
        .find((line) => line.includes("webSearch:provider_failure"));
      expect(logged).toBeDefined();
      expect(logged).toContain("provider down");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("logs the provider-failure cause for a configuration gap", async () => {
    mocks.searchWeb.mockRejectedValue({
      code: "NOT_CONFIGURED",
      message: "GEMINI_API_KEY is not set.",
    });
    const { supabase } = makeSupabase();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await runWebResearch(supabase, RESEARCH_ID, "q");

      expect(result.error?.code).toBe("DATABASE_ERROR");
      const logged = errorSpy.mock.calls
        .map((call) => call.join(" "))
        .find((line) => line.includes("webSearch:provider_failure"));
      expect(logged).toBeDefined();
      expect(logged).toContain("NOT_CONFIGURED");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("skips results whose URL already exists in the research", async () => {
    const existing: WebSearchResult[] = [
      { title: "New page", url: "https://example.com/page" },
    ];
    mocks.searchWeb.mockResolvedValue(existing);
    const { supabase, insertCalls } = makeSupabase({
      listResult: {
        data: [makeSource({ url: "https://example.com/page" })],
        error: null,
      },
    });

    const result = await runWebResearch(supabase, RESEARCH_ID, "q");

    expect(result.error).toBeNull();
    expect(result.data.addedCount).toBe(0);
    expect(insertCalls).not.toHaveBeenCalled();
  });

  it("persists new sources and returns metadata-only items", async () => {
    mocks.searchWeb.mockResolvedValue([
      { title: "First result", url: "https://example.com/one" },
      { title: "Second result", url: "https://example.com/two" },
    ]);
    const { supabase, insertCalls } = makeSupabase({
      listResult: { data: [], error: null },
      insertResults: [
        { data: makeSource({ title: "First result", url: "https://example.com/one" }), error: null },
        { data: makeSource({ title: "Second result", url: "https://example.com/two" }), error: null },
      ],
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const result = await runWebResearch(supabase, RESEARCH_ID, "q");

      expect(result.error).toBeNull();
      expect(result.data.addedCount).toBe(2);
      expect(result.data.items).toHaveLength(2);
      expect(result.data.items[0]).toMatchObject({
        kind: "source",
        content: "",
        metadata: { publisher: "Web search", url: "https://example.com/one" },
      });
      expect(insertCalls).toHaveBeenCalledTimes(2);
      const joined = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(joined).toContain("[research] webSearch:provider_success results=2");
      expect(joined).toContain("[research] webSearch:source_insert_success count=2");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("truncates titles to the cap", async () => {
    mocks.searchWeb.mockResolvedValue([
      { title: "x".repeat(400), url: "https://example.com/long" },
    ]);
    const { supabase, insertCalls } = makeSupabase({
      insertResults: [
        { data: makeSource({ title: "x".repeat(300), url: "https://example.com/long" }), error: null },
      ],
    });

    const result = await runWebResearch(supabase, RESEARCH_ID, "q");

    expect(result.error).toBeNull();
    const insertPayload = insertCalls.mock.calls[0][0];
    expect(insertPayload.title).toHaveLength(300);
  });

  it("skips a failed insert and keeps the remaining results", async () => {
    mocks.searchWeb.mockResolvedValue([
      { title: "Failing", url: "https://example.com/fail" },
      { title: "Ok", url: "https://example.com/ok" },
    ]);
    const { supabase } = makeSupabase({
      listResult: { data: [], error: null },
      insertResults: [
        { data: null, error: { code: "DATABASE_ERROR", message: "insert failed" } },
        { data: makeSource({ title: "Ok", url: "https://example.com/ok" }), error: null },
      ],
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await runWebResearch(supabase, RESEARCH_ID, "q");

      expect(result.error).toBeNull();
      expect(result.data.addedCount).toBe(1);
      expect(result.data.items).toHaveLength(1);
      expect(
        errorSpy.mock.calls.some((call) =>
          call.join(" ").includes("webSearch:source_insert_failure")
        )
      ).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("stops persisting once the new-source cap is reached", async () => {
    const results: WebSearchResult[] = Array.from({ length: 8 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
    }));
    mocks.searchWeb.mockResolvedValue(results);
    const { supabase, insertCalls } = makeSupabase({
      listResult: { data: [], error: null },
      insertResults: Array.from({ length: 8 }, (_, i) => ({
        data: makeSource({ title: `Result ${i}`, url: `https://example.com/${i}` }),
        error: null,
      })),
    });

    const result = await runWebResearch(supabase, RESEARCH_ID, "q");

    expect(result.error).toBeNull();
    expect(result.data.addedCount).toBe(5);
    expect(insertCalls).toHaveBeenCalledTimes(5);
  });
});
