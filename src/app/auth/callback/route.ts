import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/register", requestUrl.origin));
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("OAuth code exchange failed:", exchangeError);
      return NextResponse.redirect(
        new URL("/register?error=oauth_failed", requestUrl.origin)
      );
    }

    return NextResponse.redirect(new URL("/", requestUrl.origin));
  }

  return NextResponse.redirect(new URL("/register", requestUrl.origin));
}
