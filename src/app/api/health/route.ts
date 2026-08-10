import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Development-only Supabase connectivity check.
  // Queries a table that does not exist: a successful round-trip to the
  // project returns a PostgREST "relation does not exist" error, which is
  // the expected proof that the client and project are wired correctly.
  const supabase = await createClient();

  const { error } = await supabase.from("_phase_4_1_health_check").select("*").limit(1);

  const response = {
    ok: Boolean(error && (error.code === "PGRST205" || error.code === "42P01")),
    detail: error?.message ?? "unexpected: no error returned",
    code: error?.code ?? null,
  };

  return NextResponse.json(response, { status: response.ok ? 200 : 502 });
}
