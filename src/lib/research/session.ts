import type { User } from "@supabase/supabase-js";
import type { Supabase } from "./types";
import { unauthorized, type AppError } from "./errors";

export type SessionResult = { user: User } | { error: AppError };

/**
 * Resolves the authenticated user from the server session. Every data-layer
 * operation that touches user-owned data starts here; ownership is derived
 * from `auth.getUser()` and never from caller-supplied values.
 */
export async function requireUser(
  supabase: Supabase
): Promise<SessionResult> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { error: unauthorized() };
  }

  return { user: data.user };
}
