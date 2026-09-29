import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  profileMaybeSingle: vi.fn(),
  profileUpsert: vi.fn(),
  cookiesGetAll: vi.fn(),
  cookiesSet: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: mocks.cookiesGetAll,
    set: mocks.cookiesSet,
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/auth/internal-path", () => ({
  resolveInternalPath: (raw: string | null | undefined) => raw ?? "/",
}));

import { GET } from "@/app/auth/callback/route";

const PROJECT_HOST = "abcdefghijklm.supabase.co";

function mockSupabaseClient() {
  mocks.createClient.mockReturnValue({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mocks.profileMaybeSingle })),
      })),
      upsert: mocks.profileUpsert,
    })),
  });
}

function callbackRequest(code: string, origin = "login") {
  return new NextRequest(
    `https://example.com/auth/callback?code=${encodeURIComponent(code)}`,
    { headers: { cookie: `oauth_origin=${origin}` } },
  );
}

function expectRedirectTo(
  response: Response,
  pathname: string,
  search: string,
) {
  const location = new URL(response.headers.get("location")!);
  expect(response.status).toBe(307);
  expect(location.pathname).toBe(pathname);
  expect(location.search).toBe(search);
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${PROJECT_HOST}`;
  mocks.cookiesGetAll.mockReturnValue([]);
  mocks.cookiesSet.mockImplementation(() => {});
  mocks.signOut.mockResolvedValue({ error: null });
  mockSupabaseClient();
  vi.clearAllMocks();
});

describe("GET /auth/callback", () => {
  it("admits an existing Google user whose application profile exists", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "existing-user" } },
    });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { id: "existing-user" },
      error: null,
    });

    const response = await GET(callbackRequest("valid-code", "login"));

    expectRedirectTo(response, "/", "");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
  });

  it("rejects a Google identity with no application profile and creates nothing", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "brand-new-google-identity" } },
    });
    mocks.profileMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await GET(callbackRequest("valid-code", "login"));

    expectRedirectTo(response, "/login", "?error=account_not_found");
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
  });

  it("signs out and expires the session cookie on a rejected identity", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "brand-new-google-identity" } },
    });
    mocks.profileMaybeSingle.mockResolvedValue({ data: null, error: null });

    await GET(callbackRequest("valid-code", "login"));

    // The server-side sign-out ran and the session cookie is expired in the
    // response cookie store, so the failed attempt leaves no session behind.
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.cookiesSet).toHaveBeenCalledWith(
      `sb-${PROJECT_HOST.split(".")[0]}-auth-token`,
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
  });

  it("routes a signup-blocked exchange error to the account_not_found message", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: "Signup not allowed for this instance", hint: null },
    });

    const response = await GET(callbackRequest("new-user-code", "register"));

    expectRedirectTo(response, "/register", "?error=account_not_found");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("routes a generic exchange failure to oauth_failed", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: "Invalid code", hint: null },
    });

    const response = await GET(callbackRequest("bad-code", "login"));

    expectRedirectTo(response, "/login", "?error=oauth_failed");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("returns to the requested destination after a successful exchange", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "existing-user" } },
    });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { id: "existing-user" },
      error: null,
    });

    const request = new NextRequest(
      "https://example.com/auth/callback?code=valid-code",
      {
        headers: {
          cookie: "oauth_origin=login; auth_destination=%2Fresearch",
        },
      },
    );

    const response = await GET(request);

    expectRedirectTo(response, "/research", "");
  });
});
