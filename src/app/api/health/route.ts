import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Development-only Supabase connectivity check. A successful round-trip to
  // the project (a query that returns without error) proves the client and
  // project are wired correctly.
  const supabase = await createClient();

  const { error } = await supabase.from("profiles").select("id").limit(1);

  const response = {
    ok: !error,
    detail: error?.message ?? "ok",
    code: error?.code ?? null,
  };

  return NextResponse.json(response, { status: response.ok ? 200 : 502 });
}
