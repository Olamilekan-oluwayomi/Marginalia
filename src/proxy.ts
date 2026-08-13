import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_MARKER = "-auth-token";

/**
 * True when the request carries a Supabase session cookie. This is a cheap,
 * synchronous gate: it decides only whether the request should reach the
 * protected page or be sent to the login screen. It never validates the
 * session — pages authorize authoritatively through their data layer
 * (`requireUser`/`getCurrentUser`, backed by RLS), so a forged or stale
 * cookie passing this gate is still rejected at render time.
 *
 * The gate is deliberately network-free: the previous implementation called
 * `supabase.auth.getUser()`, which makes a round trip to the auth server on
 * every request — including every client-side navigation — on top of the same
 * authoritative check the page already performs.
 *
 * Supabase's SSR cookie helper chunk-splits large session JWTs into multiple
 * cookies named `sb-<project-ref>-auth-token.0`, `.1`, `.2`, ... (each capped
 * at 3180 characters), so the plain `sb-<ref>-auth-token` name never appears
 * in the request once a session is large enough to need chunking. Matching on
 * the `sb-` prefix plus a "-auth-token" substring — instead of an exact
 * suffix match — recognizes both the single-cookie and chunked forms.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(
    (cookie) =>
      cookie.name.startsWith("sb-") &&
      cookie.name.includes(SESSION_COOKIE_MARKER)
  );
}

export async function proxy(request: NextRequest) {
  if (hasSessionCookie(request)) {
    return NextResponse.next({ request });
  }

  const pathname = request.nextUrl.pathname;
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("redirectTo", pathname + request.nextUrl.search);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/", "/research/:path*", "/documents", "/settings"],
};
