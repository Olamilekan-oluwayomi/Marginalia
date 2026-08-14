import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentRow, Supabase } from "@/lib/research/types";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/research/session", () => ({
  requireUser: mocks.requireUser,
}));

import {
  deleteDocumentWithStorage,
  resetDocumentToPending,
} from "@/lib/research/documents";

const USER_ID = "user-1";
const RESEARCH_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const STORAGE_PATH = `${USER_ID}/${RESEARCH_ID}/${DOCUMENT_ID}.pdf`;

function makeDocument(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: DOCUMENT_ID,
    research_id: RESEARCH_ID,
    user_id: USER_ID,
    title: "paper.pdf",
    file_name: "paper.pdf",
    file_path: STORAGE_PATH,
    mime_type: "application/pdf",
    file_size: 1000,
    status: "failed",
    content: null,
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

type ChainResult = { data: unknown; error: unknown };

/**
 * Builds a fake Supabase client whose documents query builder serves fixed
 * results for the read, update, and delete chains, and whose storage client
 * serves a fixed remove result.
 */
function makeSupabase(options: {
  getResult: ChainResult;
  deleteResult: ChainResult;
  updateResult?: ChainResult;
  removeResult?: ChainResult;
}): {
  supabase: Supabase;
  storageFrom: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  const updateResult = options.updateResult ?? { data: null, error: null };
  const removeResult = options.removeResult ?? { data: null, error: null };
  const remove = vi.fn().mockResolvedValue(removeResult);
  const storageFrom = vi.fn().mockReturnValue({ remove });

  const maybeSingleGet = vi.fn().mockResolvedValue(options.getResult);
  const maybeSingleDelete = vi.fn().mockResolvedValue(options.deleteResult);
  const maybeSingleUpdate = vi.fn().mockResolvedValue(updateResult);

  const supabase = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleGet }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ maybeSingle: maybeSingleDelete }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: maybeSingleUpdate,
            }),
          }),
        }),
      }),
    }),
    storage: { from: storageFrom },
  } as unknown as Supabase;

  return { supabase, storageFrom, remove };
}

const UNAUTHORIZED_SESSION = { error: { code: "UNAUTHORIZED" } };
const AUTH_SESSION = { user: { id: USER_ID } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(AUTH_SESSION);
});

describe("resetDocumentToPending", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await resetDocumentToPending({} as Supabase, DOCUMENT_ID);

    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(result.data).toBe(false);
  });

  it("rejects an invalid document id", async () => {
    const result = await resetDocumentToPending(
      {} as Supabase,
      "not-a-uuid"
    );

    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("resets a failed document back to pending", async () => {
    const { supabase } = makeSupabase({
      getResult: { data: null, error: null },
      deleteResult: { data: null, error: null },
      updateResult: { data: { id: DOCUMENT_ID }, error: null },
    });

    const result = await resetDocumentToPending(supabase, DOCUMENT_ID);

    expect(result.error).toBeNull();
    expect(result.data).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith("documents");
  });

  it("reports false when the document is not failed", async () => {
    const { supabase } = makeSupabase({
      getResult: { data: null, error: null },
      deleteResult: { data: null, error: null },
      updateResult: { data: null, error: null },
    });

    const result = await resetDocumentToPending(supabase, DOCUMENT_ID);

    expect(result.error).toBeNull();
    expect(result.data).toBe(false);
  });
});

describe("deleteDocumentWithStorage", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);

    const result = await deleteDocumentWithStorage({} as Supabase, DOCUMENT_ID);

    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("rejects an invalid document id", async () => {
    const result = await deleteDocumentWithStorage(
      {} as Supabase,
      "not-a-uuid"
    );

    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns not found without touching storage for a missing document", async () => {
    const { supabase, storageFrom, remove } = makeSupabase({
      getResult: { data: null, error: null },
      deleteResult: { data: null, error: null },
    });

    const result = await deleteDocumentWithStorage(supabase, DOCUMENT_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
    expect(storageFrom).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes the row and its storage object", async () => {
    const { supabase, remove } = makeSupabase({
      getResult: { data: makeDocument(), error: null },
      deleteResult: { data: { id: DOCUMENT_ID }, error: null },
    });

    const result = await deleteDocumentWithStorage(supabase, DOCUMENT_ID);

    expect(result.error).toBeNull();
    expect(remove).toHaveBeenCalledWith([STORAGE_PATH]);
  });

  it("still succeeds when the storage object removal fails (best effort)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase, remove } = makeSupabase({
      getResult: { data: makeDocument(), error: null },
      deleteResult: { data: { id: DOCUMENT_ID }, error: null },
      removeResult: { data: null, error: { message: "object not found" } },
    });

    const result = await deleteDocumentWithStorage(supabase, DOCUMENT_ID);

    expect(result.error).toBeNull();
    expect(remove).toHaveBeenCalledWith([STORAGE_PATH]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("propagates a row-delete failure without touching storage", async () => {
    const { supabase, storageFrom, remove } = makeSupabase({
      getResult: { data: makeDocument(), error: null },
      deleteResult: {
        data: null,
        error: { code: "DATABASE_ERROR", message: "delete failed" },
      },
    });

    const result = await deleteDocumentWithStorage(supabase, DOCUMENT_ID);

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(storageFrom).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
