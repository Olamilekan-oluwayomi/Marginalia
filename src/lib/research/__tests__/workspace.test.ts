import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Supabase } from "@/lib/research/types";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/research/session", () => ({
  requireUser: mocks.requireUser,
}));

import { getResearchWorkspace } from "@/lib/research/workspace";

const USER_ID = "user-1";
const RESEARCH_ID = "11111111-1111-4111-8111-111111111111";

function makeSupabase(options: {
  researchResult?: unknown;
  questionsResult?: unknown;
  answersResult?: unknown;
  documentsResult?: unknown;
  sourcesResult?: unknown;
  citableSourcesResult?: unknown;
}) {
  const researchResult = options.researchResult ?? { data: null, error: null };
  const questionsResult = options.questionsResult ?? { data: [], error: null };
  const answersResult = options.answersResult ?? { data: [], error: null };
  const documentsResult = options.documentsResult ?? { data: [], error: null };
  const sourcesResult = options.sourcesResult ?? { data: [], error: null };
  const citableSourcesResult = options.citableSourcesResult ?? {
    data: [],
    error: null,
  };

  const callCounts: Record<string, number> = { sources: 0 };
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "research") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(researchResult),
          }),
        }),
      };
    }
    if (table === "research_questions") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue(questionsResult),
          }),
        }),
      };
    }
    if (table === "answers") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue(answersResult),
          }),
        }),
      };
    }
    if (table === "documents") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue(documentsResult),
          }),
        }),
      };
    }
    if (table === "sources") {
      callCounts.sources += 1;
      if (callCounts.sources === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(sourcesResult),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue(citableSourcesResult),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { supabase: { from } as unknown as Supabase, from };
}

const UNAUTHORIZED_SESSION = { error: { code: "UNAUTHORIZED" } };
const AUTH_SESSION = { user: { id: USER_ID } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(AUTH_SESSION);
});

describe("getResearchWorkspace", () => {
  it("rejects an invalid research id", async () => {
    const result = await getResearchWorkspace({} as Supabase, "not-a-uuid");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await getResearchWorkspace({} as Supabase, RESEARCH_ID);
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("maps a missing research to NOT_FOUND", async () => {
    const { supabase } = makeSupabase({ researchResult: { data: null, error: null } });
    const result = await getResearchWorkspace(supabase, RESEARCH_ID);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("assembles questions with their answers", async () => {
    const { supabase } = makeSupabase({
      researchResult: { data: { id: RESEARCH_ID, user_id: USER_ID, title: "R" }, error: null },
      questionsResult: {
        data: [{ id: "q1", research_id: RESEARCH_ID, question: "Q?" }],
        error: null,
      },
      answersResult: {
        data: [
          {
            id: "a1",
            question_id: "q1",
            research_id: RESEARCH_ID,
            content: "A.",
            citations: [],
          },
        ],
        error: null,
      },
    });

    const result = await getResearchWorkspace(supabase, RESEARCH_ID);

    expect(result.error).toBeNull();
    expect(result.data!.questions).toHaveLength(1);
    expect(result.data!.questions[0].answers).toHaveLength(1);
    expect(result.data!.questions[0].answers[0].id).toBe("a1");
  });

  it("labels sources with has_content from the citable lookup", async () => {
    const { supabase } = makeSupabase({
      researchResult: { data: { id: RESEARCH_ID, user_id: USER_ID, title: "R" }, error: null },
      sourcesResult: {
        data: [
          { id: "s1", research_id: RESEARCH_ID, title: "Src", content: null },
        ],
        error: null,
      },
      citableSourcesResult: { data: [{ id: "s1" }], error: null },
    });

    const result = await getResearchWorkspace(supabase, RESEARCH_ID);

    expect(result.error).toBeNull();
    expect(result.data!.sources[0].has_content).toBe(true);
  });

  it("marks a source without content as not citable", async () => {
    const { supabase } = makeSupabase({
      researchResult: { data: { id: RESEARCH_ID, user_id: USER_ID, title: "R" }, error: null },
      sourcesResult: {
        data: [{ id: "s2", research_id: RESEARCH_ID, title: "Src" }],
        error: null,
      },
      citableSourcesResult: { data: [], error: null },
    });

    const result = await getResearchWorkspace(supabase, RESEARCH_ID);

    expect(result.error).toBeNull();
    expect(result.data!.sources[0].has_content).toBe(false);
  });

  it("maps a documents query failure to DATABASE_ERROR", async () => {
    const { supabase } = makeSupabase({
      researchResult: { data: { id: RESEARCH_ID, user_id: USER_ID, title: "R" }, error: null },
      documentsResult: { data: null, error: { message: "boom" } },
    });

    const result = await getResearchWorkspace(supabase, RESEARCH_ID);

    expect(result.error?.code).toBe("DATABASE_ERROR");
  });
});
