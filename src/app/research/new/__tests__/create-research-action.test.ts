import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  createResearch: vi.fn(),
  requireText: vi.fn(),
  optionalText: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/research", () => ({
  createSupabaseClient: mocks.createSupabaseClient,
  createResearch: mocks.createResearch,
  requireText: mocks.requireText,
  optionalText: mocks.optionalText,
}));

import { createResearchAction } from "@/app/research/new/actions";

const initialState = { fieldErrors: {}, formError: null };
const RESEARCH_ID = "11111111-1111-4111-8111-111111111111";

function formDataWith(title: string, description?: string): FormData {
  const formData = new FormData();
  formData.set("title", title);
  if (description !== undefined) formData.set("description", description);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireText.mockReturnValue(null);
  mocks.optionalText.mockReturnValue(null);
  mocks.createSupabaseClient.mockResolvedValue({});
  mocks.createResearch.mockResolvedValue({
    error: null,
    data: { id: RESEARCH_ID, title: "New research" },
  });
  mocks.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("createResearchAction", () => {
  it("creates the research and redirects to its workspace", async () => {
    await expect(
      createResearchAction(
        initialState,
        formDataWith("  My research  ", "  A description  "),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.createResearch).toHaveBeenCalledWith(expect.anything(), {
      title: "My research",
      description: "A description",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/research");
    expect(mocks.redirect).toHaveBeenCalledWith(`/research/${RESEARCH_ID}`);
  });

  it("drops a blank description", async () => {
    await expect(
      createResearchAction(initialState, formDataWith("My research", "   ")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.createResearch).toHaveBeenCalledWith(expect.anything(), {
      title: "My research",
      description: undefined,
    });
  });

  it("returns field errors for an invalid title", async () => {
    mocks.requireText.mockReturnValue({
      message: "Title must be at least 1 character.",
    });

    const state = await createResearchAction(initialState, formDataWith("  "));

    expect(state.fieldErrors.title).toBe("Title must be at least 1 character.");
    expect(state.formError).toBeNull();
    expect(mocks.createResearch).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns field errors for an invalid description", async () => {
    mocks.optionalText.mockReturnValue({
      message: "Description is too long.",
    });

    const state = await createResearchAction(
      initialState,
      formDataWith("My research", "too long"),
    );

    expect(state.fieldErrors.description).toBe("Description is too long.");
    expect(mocks.createResearch).not.toHaveBeenCalled();
  });

  it("surfaces a sign-in error", async () => {
    mocks.createResearch.mockResolvedValue({
      error: { code: "UNAUTHORIZED", message: "Sign in required." },
      data: null,
    });

    const state = await createResearchAction(
      initialState,
      formDataWith("My research"),
    );

    expect(state.formError).toContain("signed in");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("surfaces a generic failure without redirecting", async () => {
    mocks.createResearch.mockResolvedValue({
      error: { code: "DATABASE_ERROR", message: "insert failed" },
      data: null,
    });

    const state = await createResearchAction(
      initialState,
      formDataWith("My research"),
    );

    expect(state.formError).toContain("couldn't create your research");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
