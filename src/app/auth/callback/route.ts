import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolveInternalPath } from "@/lib/auth/internal-path";

export const dynamic = "force-dynamic";

function readDestination(request: NextRequest): string {
  const raw = request.cookies.get("auth_destination")?.value;

  if (!raw) {
    return "/";
  }

  try {
    return resolveInternalPath(decodeURIComponent(raw));
  } catch {
    return "/";
  }
}

function buildRedirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.cookies.delete("oauth_origin");
  response.cookies.delete("auth_destination");
  return response;
}

function sessionCookieName(): string {
  const host =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, "") ?? "";
  return `sb-${host.split(".")[0]}-auth-token`;
}

async function rejectUnknownLogin(
  request: NextRequest,
  supabase: SupabaseClient,
  errorParam = "account_not_found"
) {
  try {
    await supabase.auth.signOut();
  } catch {
    // Sign-out itself failed; the cookie clearing below still ends the session.
  }

  const cookieStore = await cookies();
  const names = new Set<string>();
  cookieStore.getAll().forEach(({ name }) => names.add(name));
  names.add(sessionCookieName());
  names.add("oauth_origin");
  names.add("auth_destination");
  names.forEach((name) => cookieStore.set(name, "", { maxAge: 0, path: "/" }));

  const response = NextResponse.redirect(
    new URL(`/login?error=${errorParam}`, request.url)
  );
  request.cookies.getAll().forEach(({ name }) =>
    response.cookies.delete(name)
  );
  return response;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const source =
    request.cookies.get("oauth_origin")?.value === "login" ? "login" : "register";

  if (error) {
    return buildRedirect(request, `/${source}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("OAuth code exchange failed:", exchangeError);
      return buildRedirect(request, `/${source}?error=oauth_failed`);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return rejectUnknownLogin(request, supabase);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to verify application profile:", profileError);
      return rejectUnknownLogin(request, supabase, "profile_check_failed");
    }

    if (!profile) {
      const selfHealDisplayName =
        user.user_metadata?.display_name ??
        user.user_metadata?.name ??
        "New Researcher";

      const { error: selfHealError } = await supabase
        .from("profiles")
        .upsert(
          { id: user.id, display_name: selfHealDisplayName },
          { onConflict: "id", ignoreDuplicates: true }
        );

      if (selfHealError) {
        console.error("profile_self_heal_failed:", selfHealError);
        return rejectUnknownLogin(request, supabase);
      }

      const { data: healedProfile, error: recheckError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (recheckError) {
        console.error("profile_self_heal_failed:", recheckError);
        return rejectUnknownLogin(request, supabase);
      }

      if (!healedProfile) {
        console.error(
          "profile_self_heal_failed:",
          "profile row still missing after self-heal insert"
        );
        return rejectUnknownLogin(request, supabase);
      }
    }

    return buildRedirect(request, readDestination(request));
  }

  return buildRedirect(request, `/${source}`);
}
