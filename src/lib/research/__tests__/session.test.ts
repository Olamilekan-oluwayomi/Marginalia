import { describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/research/session";
import type { Supabase } from "@/lib/research/types";

function makeSupabase(getUserResult: {
  data: { user: unknown } | null;
  error: unknown;
}): { supabase: Supabase; getUser: ReturnType<typeof vi.fn> } {
  const getUser = vi.fn().mockResolvedValue(getUserResult);
  const supabase = { auth: { getUser } } as unknown as Supabase;
  return { supabase, getUser };
}

describe("requireUser", () => {
  it("returns the user from the session", async () => {
    const { supabase, getUser } = makeSupabase({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const result = await requireUser(supabase);

    expect(getUser).toHaveBeenCalledOnce();
    expect("user" in result && result.user.id).toBe("user-1");
  });

  it("rejects when the session lookup fails", async () => {
    const { supabase } = makeSupabase({
      data: null,
      error: { message: "Auth session missing." },
    });

    const result = await requireUser(supabase);

    expect("error" in result && result.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects when no user is present in a clean session", async () => {
    const { supabase } = makeSupabase({
      data: { user: null },
      error: null,
    });

    const result = await requireUser(supabase);

    expect("error" in result && result.error.code).toBe("UNAUTHORIZED");
  });
});
