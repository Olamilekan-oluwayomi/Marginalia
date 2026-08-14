import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Development-only Supabase connectivity check. Returns 404 outside of
 * `next dev` (matching /api/ai/health), so it can never ship to production.
 * A successful round-trip to the project proves the client and project are
 * wired correctly. The response is a plain boolean — raw provider errors are
 * logged server-side and never echoed to the client.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();

  const { error } = await supabase.from("profiles").select("id").limit(1);

  if (error) {
    console.error("Supabase connectivity check failed:", error.message);
  }

  return NextResponse.json({ ok: !error }, { status: error ? 502 : 200 });
}
