import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Supabase } from "@/lib/research/types";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/research/session", () => ({
  requireUser: mocks.requireUser,
}));

import { getRecentUserQuestionCount } from "@/lib/research/questions";

const USER_ID = "user-1";

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
