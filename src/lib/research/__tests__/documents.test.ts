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
  createDocument,
  deleteDocument,
  deleteDocumentWithStorage,
  getAllDocuments,
  getDocumentById,
  getDocuments,
  resetDocumentToPending,
  setDocumentContent,
  setDocumentFilePath,
  setDocumentFailed,
  setDocumentProcessing,
  setDocumentReady,
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
    const result = await resetDocumentToPending({} as Supabase, "not-a-uuid");

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
      "not-a-uuid",
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

function makeQuerySupabase(
  options: {
    listResult?: { data: unknown; error: unknown };
    maybeSingleResult?: { data: unknown; error: unknown };
    insertResult?: { data: unknown; error: unknown };
    updateResult?: { data: unknown; error: unknown };
    plainUpdateResult?: { data: unknown; error: unknown };
  } = {},
): {
  supabase: Supabase;
  from: ReturnType<typeof vi.fn>;
  selectSpy: ReturnType<typeof vi.fn>;
  updateSpy: ReturnType<typeof vi.fn>;
  insertSpy: ReturnType<typeof vi.fn>;
  deleteSpy: ReturnType<typeof vi.fn>;
} {
  const listResult = options.listResult ?? { data: [], error: null };
  const maybeSingleResult = options.maybeSingleResult ?? {
    data: null,
    error: null,
  };
  const insertResult = options.insertResult ?? { data: null, error: null };
  const updateResult = options.updateResult ?? { data: null, error: null };
  const plainUpdateResult = options.plainUpdateResult ?? {
    data: null,
    error: null,
  };

  const selectSpy = vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue(listResult),
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue(listResult),
      maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
    }),
  });
  const insertSpy = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(insertResult),
    }),
  });
  const maybeSingleSpy = vi.fn().mockResolvedValue(updateResult);
  const updateChain = {
    select: vi.fn().mockReturnValue({ maybeSingle: maybeSingleSpy }),
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ maybeSingle: maybeSingleSpy }),
    }),
    then: (resolve: (value: { data: unknown; error: unknown }) => void) =>
      resolve(plainUpdateResult),
  };
  const updateSpy = vi
    .fn()
    .mockReturnValue({ eq: vi.fn().mockReturnValue(updateChain) });
  const deleteSpy = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
      }),
    }),
  });

  const from = vi.fn().mockReturnValue({
    select: selectSpy,
    insert: insertSpy,
    update: updateSpy,
    delete: deleteSpy,
  });

  return {
    supabase: { from } as unknown as Supabase,
    from,
    selectSpy,
    updateSpy,
    insertSpy,
    deleteSpy,
  };
}

describe("getDocuments", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await getDocuments({} as Supabase, RESEARCH_ID);
    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(result.data).toEqual([]);
  });

  it("rejects an invalid research id", async () => {
    const result = await getDocuments({} as Supabase, "not-a-uuid");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns the documents for a research", async () => {
    const { supabase, from } = makeQuerySupabase({
      listResult: { data: [makeDocument()], error: null },
    });

    const result = await getDocuments(supabase, RESEARCH_ID);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(from).toHaveBeenCalledWith("documents");
  });

  it("maps a query failure to DATABASE_ERROR", async () => {
    const { supabase } = makeQuerySupabase({
      listResult: { data: null, error: { message: "boom" } },
    });

    const result = await getDocuments(supabase, RESEARCH_ID);

    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.data).toEqual([]);
  });
});

describe("getAllDocuments", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await getAllDocuments({} as Supabase);
    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(result.data).toEqual([]);
  });

  it("returns metadata summaries newest first", async () => {
    const { supabase, selectSpy } = makeQuerySupabase({
      listResult: { data: [makeDocument()], error: null },
    });

    const result = await getAllDocuments(supabase);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(selectSpy).toHaveBeenCalledWith(
      "id, research_id, user_id, title, file_name, mime_type, file_size, status, created_at, updated_at",
    );
  });
});

describe("getDocumentById", () => {
  it("rejects an invalid document id", async () => {
    const result = await getDocumentById({} as Supabase, "not-a-uuid");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await getDocumentById({} as Supabase, DOCUMENT_ID);
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("returns the document", async () => {
    const { supabase } = makeQuerySupabase({
      maybeSingleResult: { data: makeDocument(), error: null },
    });

    const result = await getDocumentById(supabase, DOCUMENT_ID);

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(DOCUMENT_ID);
  });

  it("maps a missing document to NOT_FOUND", async () => {
    const { supabase } = makeQuerySupabase({
      maybeSingleResult: { data: null, error: null },
    });

    const result = await getDocumentById(supabase, DOCUMENT_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("createDocument", () => {
  it("rejects missing title and file name", async () => {
    const result = await createDocument({} as Supabase, RESEARCH_ID, {
      title: "",
      file_name: "",
      file_path: "",
    });
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue(UNAUTHORIZED_SESSION);
    const result = await createDocument({} as Supabase, RESEARCH_ID, {
      title: "paper.pdf",
      file_name: "paper.pdf",
      file_path: STORAGE_PATH,
    });
    expect(result.error?.code).toBe("UNAUTHORIZED");
  });

  it("inserts a document owned by the session user with trimmed fields", async () => {
    const { supabase, insertSpy } = makeQuerySupabase({
      insertResult: { data: makeDocument(), error: null },
    });

    const result = await createDocument(supabase, RESEARCH_ID, {
      title: "  paper.pdf  ",
      file_name: "paper.pdf",
      file_path: STORAGE_PATH,
      mime_type: " application/pdf ",
      file_size: 100,
    });

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(DOCUMENT_ID);
    expect(insertSpy).toHaveBeenCalledWith({
      research_id: RESEARCH_ID,
      user_id: USER_ID,
      title: "paper.pdf",
      file_name: "paper.pdf",
      file_path: STORAGE_PATH,
      mime_type: "application/pdf",
      file_size: 100,
    });
  });
});

describe("setDocumentProcessing", () => {
  it("rejects an invalid document id", async () => {
    const result = await setDocumentProcessing({} as Supabase, "not-a-uuid");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.data).toBe(false);
  });

  it("returns true when the claim wins", async () => {
    const { supabase, updateSpy } = makeQuerySupabase({
      updateResult: { data: { id: DOCUMENT_ID }, error: null },
    });

    const result = await setDocumentProcessing(supabase, DOCUMENT_ID);

    expect(result.error).toBeNull();
    expect(result.data).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith({ status: "processing" });
  });

  it("returns false when another worker already claimed the document", async () => {
    const { supabase } = makeQuerySupabase({
      updateResult: { data: null, error: null },
    });

    const result = await setDocumentProcessing(supabase, DOCUMENT_ID);

    expect(result.error).toBeNull();
    expect(result.data).toBe(false);
  });
});

describe("setDocumentReady / setDocumentFailed", () => {
  it("marks a document ready", async () => {
    const { supabase, updateSpy } = makeQuerySupabase();

    const result = await setDocumentReady(supabase, DOCUMENT_ID);

    expect(result.error).toBeNull();
    expect(updateSpy).toHaveBeenCalledWith({ status: "ready" });
  });

  it("marks a document failed", async () => {
    const { supabase, updateSpy } = makeQuerySupabase();

    const result = await setDocumentFailed(supabase, DOCUMENT_ID);

    expect(result.error).toBeNull();
    expect(updateSpy).toHaveBeenCalledWith({ status: "failed" });
  });

  it("maps a status update failure to DATABASE_ERROR", async () => {
    const { supabase } = makeQuerySupabase({
      plainUpdateResult: { data: null, error: { message: "boom" } },
    });

    const result = await setDocumentReady(supabase, DOCUMENT_ID);

    expect(result.error?.code).toBe("DATABASE_ERROR");
  });
});

describe("setDocumentContent", () => {
  it("rejects empty content", async () => {
    const result = await setDocumentContent({} as Supabase, DOCUMENT_ID, "   ");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("persists trimmed content and returns the updated row", async () => {
    const { supabase, updateSpy } = makeQuerySupabase({
      updateResult: { data: makeDocument({ content: "body" }), error: null },
    });

    const result = await setDocumentContent(supabase, DOCUMENT_ID, "  body  ");

    expect(result.error).toBeNull();
    expect(result.data?.content).toBe("body");
    expect(updateSpy).toHaveBeenCalledWith({ content: "body" });
  });

  it("maps a zero-row update to NOT_FOUND", async () => {
    const { supabase } = makeQuerySupabase({
      updateResult: { data: null, error: null },
    });

    const result = await setDocumentContent(supabase, DOCUMENT_ID, "body");

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("setDocumentFilePath", () => {
  it("rejects an invalid path", async () => {
    const result = await setDocumentFilePath({} as Supabase, DOCUMENT_ID, "");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("updates the file path", async () => {
    const { supabase, updateSpy } = makeQuerySupabase();

    const result = await setDocumentFilePath(
      supabase,
      DOCUMENT_ID,
      STORAGE_PATH,
    );

    expect(result.error).toBeNull();
    expect(updateSpy).toHaveBeenCalledWith({ file_path: STORAGE_PATH });
  });
});

describe("deleteDocument", () => {
  it("rejects an invalid document id", async () => {
    const result = await deleteDocument({} as Supabase, "not-a-uuid");
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("deletes the row", async () => {
    const { supabase, deleteSpy } = makeQuerySupabase({
      maybeSingleResult: { data: { id: DOCUMENT_ID }, error: null },
    });

    const result = await deleteDocument(supabase, DOCUMENT_ID);

    expect(result.error).toBeNull();
    expect(deleteSpy).toHaveBeenCalled();
  });

  it("maps a missing document to NOT_FOUND", async () => {
    const { supabase } = makeQuerySupabase({
      maybeSingleResult: { data: null, error: null },
    });

    const result = await deleteDocument(supabase, DOCUMENT_ID);

    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
