import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { Supabase } from "./types";

/**
 * Creates a typed Supabase server client backed by the live schema.
 * Data-layer modules receive a `Supabase` instance as an explicit parameter
 * so callers can inject their own client (e.g. for testing).
 */
export async function createSupabaseClient(): Promise<Supabase> {
  return createSupabaseServerClient();
}
