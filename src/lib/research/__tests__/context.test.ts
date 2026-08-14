import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildContextSection,
  retrieveResearchContext,
} from "@/lib/research/context";
import { resolveCitations } from "@/lib/research/citation-generation";
import type { DocumentRow, SourceRow, Supabase } from "@/lib/research/types";

const mocks = vi.hoisted(() => ({
  getDocuments: vi.fn(),
  getSources: vi.fn(),
}));

vi.mock("@/lib/research/documents", () => ({
  getDocuments: mocks.getDocuments,
}));
vi.mock("@/lib/research/sources", () => ({
  getSources: mocks.getSources,
}));

const RESEARCH_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const fakeSupabase = {} as unknown as Supabase;

function makeDocument(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    research_id: RESEARCH_ID,
    user_id: "user-1",
    title: "Rainfall study",
    file_name: "rainfall.pdf",
    file_path: "user-1/research/rainfall.pdf",
    mime_type: "application/pdf",
    file_size: 100,
    status: "ready",
    content: null,
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

function makeSource(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    research_id: RESEARCH_ID,
    user_id: "user-1",
    title: "A source",
    url: null,
    publisher: null,
    retrieved_at: null,
    content: null,
    created_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDocuments.mockResolvedValue({ error: null, data: [] });
  mocks.getSources.mockResolvedValue({ error: null, data: [] });
});

async function retrieve(question: string) {
  const result = await retrieveResearchContext(
    fakeSupabase,
    RESEARCH_ID,
    question
  );
  expect(result.error).toBeNull();
  return result.data!;
}

describe("retrieveResearchContext", () => {
  it("loads documents and sources for the research through the data layer", async () => {
    await retrieve("extreme rainfall");

    expect(mocks.getDocuments).toHaveBeenCalledWith(
      fakeSupabase,
      RESEARCH_ID
    );
    expect(mocks.getSources).toHaveBeenCalledWith(fakeSupabase, RESEARCH_ID);
  });

  it("retrieves a ready document with its extracted content", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          title: "Rainfall onset paper",
          content: "Rainfall onset in southwestern Nigeria.",
        }),
      ],
    });

    const context = await retrieve("rainfall in Nigeria");

    expect(context.items).toHaveLength(1);
    expect(context.items[0]).toMatchObject({
      kind: "document",
      id: "11111111-1111-4111-8111-111111111111",
      title: "Rainfall onset paper",
    });
    expect(context.items[0].content).toContain("Rainfall onset");
    expect(context.hasBodyContent).toBe(true);
  });

  const NON_READY_STATUSES: DocumentRow["status"][] = [
    "pending",
    "processing",
    "failed",
  ];

  it.each(NON_READY_STATUSES)(
    "ignores a %s document even when its content would match",
    async (status) => {
      mocks.getDocuments.mockResolvedValue({
        error: null,
        data: [
          makeDocument({
            content: "Extreme rainfall methods were analysed in China.",
            status,
          }),
        ],
      });

      const context = await retrieve("extreme rainfall china");

      expect(context.items).toHaveLength(0);
      expect(context.hasBodyContent).toBe(false);
    }
  );

  it("preserves the document id through retrieval", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "22222222-2222-4222-8222-222222222222",
          content: "Extreme rainfall trends were studied.",
        }),
      ],
    });

    const context = await retrieve("extreme rainfall");

    expect(context.items[0].id).toBe("22222222-2222-4222-8222-222222222222");
    expect(context.items[0].kind).toBe("document");
  });

  it("links a retrieved document to a document_id through citation resolution", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "22222222-2222-4222-8222-222222222222",
          content: "Extreme rainfall trends were studied.",
        }),
      ],
    });

    const context = await retrieve("extreme rainfall");
    const result = resolveCitations(
      {
        answer: "text",
        citations: [{ citation_number: 1, evidence: 1 }],
      },
      context
    );

    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "22222222-2222-4222-8222-222222222222" },
    ]);
    expect(result.rejectedCount).toBe(0);
  });

  it("ranks the document whose content matches the question above an irrelevant one", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "33333333-3333-4333-8333-333333333333",
          title: "Doc A",
          file_name: "a.pdf",
          content: "Rainfall onset in southwestern Nigeria was observed.",
        }),
        makeDocument({
          id: "44444444-4444-4444-8444-444444444444",
          title: "Doc B",
          file_name: "b.pdf",
          content: "Extreme rainfall trends in China were analysed.",
        }),
      ],
    });

    const context = await retrieve("extreme rainfall in china");

    expect(context.items.map((item) => item.id)).toEqual([
      "44444444-4444-4444-8444-444444444444",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("ranks multiple documents correctly for a methodology question", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "33333333-3333-4333-8333-333333333333",
          title: "Nigeria rainfall",
          file_name: "a.pdf",
          content: "Rainfall onset in southwestern Nigeria was observed.",
        }),
        makeDocument({
          id: "44444444-4444-4444-8444-444444444444",
          title: "China precipitation",
          file_name: "b.pdf",
          content:
            "The methodology used to analyze extreme rainfall in China is described below.",
        }),
        makeDocument({
          id: "55555555-5555-4555-8555-555555555555",
          title: "Kansas crops",
          file_name: "c.pdf",
          content: "Maize yields across Kansas respond to fertilizer use.",
        }),
      ],
    });

    const context = await retrieve(
      "What methodology was used to analyze extreme rainfall in China?"
    );

    const ids = context.items.map((item) => item.id);
    expect(ids[0]).toBe("44444444-4444-4444-8444-444444444444");
    expect(ids[1]).toBe("33333333-3333-4333-8333-333333333333");
    expect(ids).not.toContain("55555555-5555-4555-8555-555555555555");
  });

  it("keeps the context bounded to the item and character budgets", async () => {
    const longContent = Array.from(
      { length: 500 },
      (_, i) => `Paragraph ${i} about extreme rainfall and wet weather.`
    ).join("\n");
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: Array.from({ length: 8 }, (_, i) =>
        makeDocument({
          id: `66666666-6666-4666-8666-00000000000${i}`,
          title: `Doc ${i}`,
          content: longContent,
        })
      ),
    });

    const context = await retrieve("extreme rainfall");

    expect(context.items.length).toBeLessThanOrEqual(6);
    for (const item of context.items) {
      expect(item.content.length).toBeLessThanOrEqual(2000);
    }
  });

  it("does not create duplicate evidence for a document that matches many keywords", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          content:
            "Extreme rainfall methodology used to analyze extreme rainfall in China.",
        }),
      ],
    });

    const context = await retrieve("extreme rainfall methodology china");

    const ids = context.items.map((item) => item.id);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(context.items.filter((item) => item.kind === "document")).toHaveLength(1);
  });

  it("selects the relevant passage from a long document rather than only the opening", async () => {
    const filler =
      "Introduction text about unrelated background material. ".repeat(300);
    const methods =
      "The three recurrence intervals and four durations used to define extreme precipitation events were 2, 5 and 10 years and 1, 3, 6 and 24 hours.";
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [makeDocument({ content: filler + methods + filler })],
    });

    const context = await retrieve(
      "recurrence intervals durations extreme precipitation"
    );

    expect(context.items).toHaveLength(1);
    expect(context.items[0].content).toContain(
      "three recurrence intervals and four durations"
    );
  });

  it("selects the methodology passage over a generic repeated phrase (real-paper pattern)", async () => {
    const filler =
      "Background introduction text without any question terms. ".repeat(50);
    const genericEarly = (
      "Seasonal distribution shows that most 1-day, 1-yr recurrence interval extreme rainfall events occur from April to September. "
    ).repeat(20);
    const methodology =
      "Extreme events were defined by duration and recurrence interval. The event durations chosen were 1, 5, 10 and 30 days and the event thresholds were those associated with recurrence intervals of 1, 5 and 10 years. These extreme precipitation events were analysed across China.";
    const tail =
      "Further results and discussion paragraphs about regional trends. ".repeat(80);

    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          content: filler + genericEarly + methodology + tail,
        }),
      ],
    });

    const context = await retrieve(
      "What were the three recurrence intervals and four durations used to define extreme precipitation events?"
    );

    expect(context.items).toHaveLength(1);
    const passage = context.items[0].content;
    expect(passage.length).toBeLessThanOrEqual(2000);
    expect(passage).toContain("recurrence intervals of 1, 5 and 10 years");
    expect(passage).toContain("1, 5, 10 and 30 days");
  });

  it("keeps an evidence statement complete when its values run past the window edge", async () => {
    const intro =
      "Background introduction text that does not mention the question. ".repeat(20);
    const dense = (
      "The analysis of extreme precipitation events and their recurrence used the duration series approach. "
    ).repeat(18);
    const methodology =
      "Event durations of 1, 5, 10 and 30 days were examined, and three precipitation total thresholds were used to identify events with recurrence intervals of 1, 5 and 10 years.";
    const tail =
      "Further results and discussion paragraphs describing the remaining findings. ".repeat(30);

    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          content: intro + dense + methodology + tail,
        }),
      ],
    });

    const context = await retrieve(
      "What were the three recurrence intervals and four durations used to define extreme precipitation events?"
    );

    expect(context.items).toHaveLength(1);
    const passage = context.items[0].content;
    expect(passage.length).toBeLessThanOrEqual(2000);
    expect(passage).toContain("1, 5, 10 and 30 days");
    expect(passage).toContain("recurrence intervals of 1, 5 and 10 years");
  });

  it("falls back to a bounded leading chunk when nothing in the content matches", async () => {
    const longContent = "Unrelated filler text without keywords. ".repeat(500);
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          title: "Extreme rainfall review",
          file_name: "rainfall-notes.pdf",
          content: longContent,
        }),
      ],
    });

    const context = await retrieve("extreme rainfall");

    expect(context.items).toHaveLength(1);
    expect(context.items[0].content.length).toBeLessThanOrEqual(2000);
    expect(context.items[0].content).toContain("Unrelated filler text");
  });

  it("labels the document and its body content in the built context section", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          title: "Extreme Rainfall Paper",
          content: "Extreme rainfall trends in China.",
        }),
      ],
    });

    const context = await retrieve("extreme rainfall china");
    const section = buildContextSection(context);

    expect(section).toContain("1. [Document] Extreme Rainfall Paper");
    expect(section).toContain("rainfall.pdf");
    expect(section).toContain("Extreme rainfall trends in China.");
  });

  it("returns no citable context when only a metadata-only source exists", async () => {
    mocks.getSources.mockResolvedValue({
      error: null,
      data: [makeSource({ title: "Guide to rainfall", url: "https://example.com" })],
    });

    const context = await retrieve("extreme rainfall");

    expect(context.items).toHaveLength(1);
    expect(context.items[0].content).toBe("");
    expect(context.hasBodyContent).toBe(false);
  });
});
