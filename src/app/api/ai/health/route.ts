import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-user";
import { checkAiProviderConnection } from "@/lib/ai/verify";

export const dynamic = "force-dynamic";

/**
 * Development-only AI connectivity check.
 *
 * The route is intentionally limited:
 * - returns 404 outside of `next dev`, so it can never ship to production
 * - requires an authenticated session
 * - uses a fixed prompt (no user-controlled input)
 * - returns only `{ ok, detail }` — never the API key or provider internals
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await checkAiProviderConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
