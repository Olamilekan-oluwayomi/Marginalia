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
  supabase: SupabaseClient
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
    new URL("/login?error=account_not_found", request.url)
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

    if (source === "register") {
      if (user && user.user_metadata?.app_registered !== true) {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: { app_registered: true },
        });
        if (metadataError) {
          console.error("Failed to mark Google registration:", metadataError);
        }
      }

      return buildRedirect(request, readDestination(request));
    }

    const registeredThroughApp =
      user?.identities?.some((identity) => identity.provider === "email") ===
        true ||
      user?.user_metadata?.app_registered === true;

    if (!user || !registeredThroughApp) {
      return rejectUnknownLogin(request, supabase);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      if (profileError) {
        console.error("Failed to verify application profile:", profileError);
      }
      return rejectUnknownLogin(request, supabase);
    }

    return buildRedirect(request, readDestination(request));
  }

  return buildRedirect(request, `/${source}`);
}
