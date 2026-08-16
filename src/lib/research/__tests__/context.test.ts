import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildContextSection,
  retrieveResearchContext,
  selectRelevantPassages,
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

describe("conceptual retrieval", () => {
  it("matches findings synonyms when the question asks about findings", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777701",
          title: "Synonym study",
          content:
            "The results and conclusions of the study indicated that rainfall patterns are changing across the region.",
        }),
        makeDocument({
          id: "77777777-7777-4777-8777-777777777702",
          title: "Raw record",
          content: "Rainfall was measured each season. ".repeat(200),
        }),
      ],
    });

    const context = await retrieve(
      "What were the main findings regarding rainfall?"
    );

    expect(context.items.map((item) => item.id)[0]).toBe(
      "77777777-7777-4777-8777-777777777701"
    );
    expect(context.items[0].content).toContain("results and conclusions");
  });

  it("prefers the methods passage carrying the exact significance level", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777711",
          title: "Trend methods",
          content:
            "Trends were evaluated at a statistical significance level of 0.05 across all stations.",
        }),
        makeDocument({
          id: "77777777-7777-4777-8777-777777777712",
          title: "Significant region",
          content: "Significant levels of trend were reported for the region. ".repeat(150),
        }),
      ],
    });

    const context = await retrieve(
      "Which statistical significance level was used to evaluate trends?"
    );

    expect(context.items.map((item) => item.id)[0]).toBe(
      "77777777-7777-4777-8777-777777777711"
    );
    expect(context.items[0].content).toContain("0.05");
  });

  it("retrieves the passage that states the significance level over repeated generic significance text", async () => {
    const filler =
      "Background introduction text without any question terms. ".repeat(50);
    const genericEarly = (
      "Statistically significant trends were observed during 1961-2009 across the study region. The significance of annual changes was evaluated at every station during the period 1961-2009. Statistical significance testing was applied to each of the 599 station records. "
    ).repeat(12);
    const midFiller = "Unrelated filler text without keywords. ".repeat(60);
    const methods =
      "Trends were evaluated using the Mann-Kendall test at a statistical significance level (a = 0.05).";

    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777713",
          title: "Trend methods paper",
          content: filler + genericEarly + midFiller + methods,
        }),
      ],
    });

    const context = await retrieve(
      "At what statistical significance level were trends evaluated?"
    );

    expect(context.items).toHaveLength(1);
    const passage = context.items[0].content;
    expect(passage.length).toBeLessThanOrEqual(2000);
    expect(passage).toContain("statistical significance level (a = 0.05)");
    expect(passage).toContain("0.05");
  });

  it("does not let a generic number-rich passage outrank the passage with the actual value", async () => {
    const filler =
      "Background introduction text without any question terms. ".repeat(50);
    const numericGeneric = (
      "Trends were evaluated during 1961-2009 at 599 stations across China. Statistical significance testing was applied during 1961-2009, and significant trends were found in 85 of the 599 station records between 1961 and 2009. "
    ).repeat(10);
    const midFiller = "Unrelated filler text without keywords. ".repeat(60);
    const methods =
      "Trends were evaluated using the Mann-Kendall test at a statistical significance level (a = 0.05).";

    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777715",
          title: "Trend methods paper",
          content: filler + numericGeneric + midFiller + methods,
        }),
      ],
    });

    const context = await retrieve(
      "At what statistical significance level were trends evaluated?"
    );

    expect(context.items).toHaveLength(1);
    const passage = context.items[0].content;
    expect(passage).toContain("statistical significance level (a = 0.05)");
    expect(passage).toContain("0.05");
  });

  it("selects the significance level statement over a correlation passage carrying the same number", async () => {
    const filler =
      "Background introduction text without any question terms. ".repeat(50);
    const correlationEarly = (
      "Statistically significant correlations were found between the series at the 0.05 level. The correlation between the monthly series was statistically significant at the 0.05 level across the study region. "
    ).repeat(8);
    const midFiller = "Unrelated filler text without keywords. ".repeat(60);
    const methods =
      "Trends were evaluated using the Mann-Kendall test at the statistical significance level (a = 0.05).";

    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777716",
          title: "Trend methods paper",
          content: filler + correlationEarly + midFiller + methods,
        }),
      ],
    });

    const context = await retrieve(
      "At what statistical significance level were trends evaluated?"
    );

    expect(context.items).toHaveLength(1);
    const passage = context.items[0].content;
    expect(passage.length).toBeLessThanOrEqual(2000);
    expect(passage).toContain("statistical significance level (a = 0.05)");
    expect(passage).toContain("0.05");
    expect(passage).not.toContain("correlations");
  });

  it("does not let unrelated number-rich content outrank the value-bearing methodological statement", async () => {
    const filler =
      "Background introduction text without any question terms. ".repeat(50);
    const numericHeavy = (
      "Statistical significance tests were applied during 1961-2009. Trends were evaluated at 45 stations, and the level of the test statistic was 0.05 for 85 of the 599 station records across the study region. "
    ).repeat(8);
    const midFiller = "Unrelated filler text without keywords. ".repeat(60);
    const methods =
      "Trends were evaluated using the Mann-Kendall test at the statistical significance level (a = 0.05).";

    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777717",
          title: "Trend methods paper",
          content: filler + numericHeavy + midFiller + methods,
        }),
      ],
    });

    const context = await retrieve(
      "At what statistical significance level were trends evaluated?"
    );

    expect(context.items).toHaveLength(1);
    const passage = context.items[0].content;
    expect(passage).toContain("statistical significance level (a = 0.05)");
    expect(passage).toContain("0.05");
  });

  it("selects the real PDF significance statement that splits the concept phrase from the value", async () => {
    // Real text from the rainfall paper (Section 3.2): the concept phrase is
    // split ("significant ... at α = 0.05 level") and Greek α is used, so a
    // literal "significance level (a = 0.05)" phrase match is impossible and a
    // strict adjacent-phrase rule scored it zero. It must still outrank the
    // generic significance text that carries no value.
    const realPassage =
      "Southeast Coast and Northwest China have the largest trend magnitude and " +
      "statistics, which are statistically significant at α = 0.05 level based on " +
      "Kendall nonparameter testing.";
    const filler =
      "Background introduction text without any question terms. ".repeat(50);
    const genericEarly = (
      "Statistically significant trends were observed during 1961-2009 across the study region. " +
      "The significance of annual changes was evaluated at every station during the period 1961-2009. "
    ).repeat(10);
    const midFiller = "Unrelated filler text without keywords. ".repeat(60);

    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777743",
          title: "Temporal variation of extreme rainfall in China",
          content: filler + genericEarly + midFiller + realPassage,
        }),
      ],
    });

    const context = await retrieve(
      "At what statistical significance level were trends evaluated?"
    );

    expect(context.items.length).toBeGreaterThanOrEqual(1);
    const passage = context.items[0].content;
    expect(passage).toContain("α = 0.05");
    expect(passage).toContain("0.05");
  });

  it("selects the value-bearing methodology statement over a number-saturated thresholds region (live shape)", async () => {
    // Mirrors the live paper extraction that failed before the fix: a long
    // document whose results/thresholds region saturates every question
    // keyword with incidental numbers (threshold values, return levels,
    // station counts) while the actual "significance level (a = 0.05)"
    // statement sits far away. Without anchoring value counts on the concept
    // phrase, the number-dense region's raw numeric count outranks the
    // methodological statement that alone pairs the concept with its value.
    const filler =
      "Background introduction text without any question terms. ".repeat(50);
    const thresholdsRegion = [
      "Trends were evaluated at 55 stations for 125 different series.",
      "The level of significance was 0.05 for 85 of the 599 records.",
      "The threshold values for 1-day and 5-yr events were 87 and 200 percent larger.",
      "Median thresholds for 10-day and 30-day events were evaluated for 599 series.",
    ].join("\n");
    const midFiller = "Unrelated filler text without keywords. ".repeat(60);
    const methods =
      "The statistical significance level (a = 0.05) was used for all trend tests.";

    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777720",
          title: "Temporal variation of extreme rainfall in China",
          content: filler + thresholdsRegion + midFiller + methods,
        }),
        makeDocument({
          id: "77777777-7777-4777-8777-777777777721",
          title: "Correlation review",
          content:
            "Statistically significant correlations were found between the series at the 0.05 level. ".repeat(
              40
            ),
        }),
      ],
    });

    const context = await retrieve(
      "At what statistical significance level were trends evaluated?"
    );

    const primary = context.items[0];
    expect(primary.id).toBe("77777777-7777-4777-8777-777777777720");
    expect(primary.content).toContain(
      "statistical significance level (a = 0.05)"
    );
    expect(primary.content).toContain("0.05");
    expect(primary.content).not.toContain("correlations");
    expect(primary.content).not.toContain("1-day, 5-yr");
    for (const item of context.items) {
      expect(item.content.length).toBeLessThanOrEqual(2000);
    }
  });

  it("retrieves the significance-level statement from a realistic full-paper extraction shape", async () => {
    // Mirrors how unpdf joins a real document: page lines joined with
    // newlines, dense keyword-rich intro/results sections on either side of
    // the methodology statement, numbers throughout, and a competing document
    // full of "significant at the 0.05 level" phrasing that never forms the
    // "significance level (a = 0.05)" statement.
    const paragraphs = [
      "Title: Changes in extreme precipitation events in China",
      "Abstract. The spatial and temporal variation of extreme precipitation was analyzed. The statistical significance of trends was evaluated, and significant increasing trends were observed over most of the study region.",
      "1. Introduction",
      "Extreme precipitation events are a major cause of flood disasters. Many previous studies have evaluated the statistical significance of trends in extreme precipitation and reported differing results. Some studies found statistically significant increases while others reported no significant change. These differences may be related to the significance testing procedures applied.",
      "2. Data",
      "Daily precipitation records from 599 stations over the period 1961-2009 were collected. The stations cover all of the major climate regions. Missing values accounted for less than 1 percent of the records.",
      "3. Methodology",
      "The Mann-Kendall test was used to evaluate trends in the extreme precipitation indices. Trends were evaluated using the Mann-Kendall test at a statistical significance level (a = 0.05). The significance level was selected following common practice. Recurrence intervals of 1, 5 and 10 years and event durations of 1, 5, 10 and 30 days were used to define extreme precipitation events.",
      "4. Results",
      "The results showed significant increasing trends at many stations. Trends were significant at the 0.05 level at 85 of the 599 stations during 1961-2009. The correlation between the series and elevation was statistically significant at the 0.05 level in several regions. Significant trends at the 0.05 level were reported in the majority of the study region.",
      "5. Conclusions",
      "Extreme precipitation increased significantly during 1961-2009 at the 0.05 level over most of the study region.",
      "References",
      "Kim et al. (2005) modeled extremes with the generalized extreme value distribution. Previous studies reported trends that were statistically significant at the 0.05 level in many regions.",
    ];
    const paper = paragraphs.join("\n");

    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777718",
          title: "Changes in extreme precipitation events in China",
          content: paper,
        }),
        makeDocument({
          id: "77777777-7777-4777-8777-777777777719",
          title: "Correlation review",
          content:
            "Statistically significant correlations were found between the series at the 0.05 level. Correlations between the monthly series were statistically significant at the 0.05 level across the study region. ".repeat(
              40
            ),
        }),
      ],
    });

    const context = await retrieve(
      "At what statistical significance level were trends evaluated?"
    );

    const primary = context.items[0];
    expect(primary.id).toBe("77777777-7777-4777-8777-777777777718");
    expect(primary.content).toContain(
      "statistical significance level (a = 0.05)"
    );
    expect(primary.content).toContain("0.05");
    expect(primary.content).not.toContain("correlations");
    for (const item of context.items) {
      expect(item.content.length).toBeLessThanOrEqual(2000);
    }

    const section = buildContextSection(context);
    expect(section).not.toBeNull();
    expect(section!).toContain(
      "statistical significance level (a = 0.05)"
    );
    expect(section!).toContain("0.05");
  });

  it("prioritizes the paper's own methodology and retrieves its findings over a prior-study review", async () => {
    const filler =
      "Background narrative paragraphs provide context for the reader. ".repeat(
        45
      );
    const litReview =
      "Earlier studies of extreme precipitation in the region applied the generalized extreme value distribution. Kim et al. (2005) applied a generalized extreme value distribution methodology to model precipitation extremes and used the Mann-Kendall test to evaluate temporal trends. Previous trend studies reported varied results across regions.";
    const methods =
      "In this study, we used daily rainfall data from 52 stations over the period 1961-2018. Extreme precipitation events were defined by duration and recurrence interval. Event durations of 1, 5, 10 and 30 days and recurrence intervals of 1, 5 and 10 years were examined. Our trend analysis was performed using the Mann-Kendall test at a statistical significance level (a = 0.05).";
    const findings =
      "The results showed increasing trends in extreme precipitation across most stations. Significant increases were observed in annual maxima and short-duration events.";

    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777714",
          title: "Extreme precipitation paper",
          content:
            filler +
            litReview +
            filler +
            methods +
            filler +
            findings +
            filler,
        }),
      ],
    });

    const context = await retrieve(
      "What methodology did the authors use and what were the main findings regarding temporal variation?"
    );

    expect(context.items).toHaveLength(2);
    expect(context.items[0].id).toBe(context.items[1].id);
    const primary = context.items[0].content;
    const secondary = context.items[1].content;
    expect(primary).toContain("we used daily rainfall data");
    expect(primary).toContain("52 stations");
    expect(primary).not.toContain("Kim et al.");
    expect(secondary).toContain("results showed");
    expect(secondary).toContain("increasing trends");
    expect(secondary).not.toBe(primary);
    for (const item of context.items) {
      expect(item.content.length).toBeLessThanOrEqual(2000);
    }
  });

  it("splits a long document into complementary passages for a multi-concept question", async () => {
    const methodology =
      "The methodology used for the analysis was extreme value theory. The approach adopted the block maxima technique for annual maxima.";
    const findings =
      "The key findings indicated that rainfall increased over time. The results showed a rising trend across all stations.";
    const filler =
      "Background narrative paragraphs provide context for the reader. ".repeat(
        40
      );
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777721",
          title: "Multi-part paper",
          content: filler + methodology + filler + findings + filler,
        }),
      ],
    });

    const context = await retrieve(
      "Describe the methodology and the main findings of the study."
    );

    expect(context.items).toHaveLength(2);
    expect(context.items[0].id).toBe(context.items[1].id);
    expect(context.items[0].content).toContain("extreme value theory");
    expect(context.items[1].content).toContain("rising trend");
    for (const item of context.items) {
      expect(item.content.length).toBeLessThanOrEqual(2000);
    }
  });
});

describe("selectRelevantPassages", () => {
  it("surfaces the value-bearing results sections alongside the methods statement when the sections are far apart", () => {
    // Real text from the rainfall paper. The question names a value concept, and
    // the paper states α = 0.05 in three places separated by thousands of
    // characters: the wavelet-coherence method (Section 2.2.4) and the trend
    // results (Sections 3.2 and 3.4). The literal phrase bonus crowns the
    // methods sentence, and that sentence's cluster covers every question
    // concept, so the old selector returned only the methods passage and the
    // model never saw the results sections that actually state the finding.
    const p224 =
      "The statistical significance level (α = 0.05) of the wavelet coherence " +
      "against background red noise was estimated using Monte Carlo sampling.";
    const p32 =
      "Southeast Coast and Northwest China have the largest trend magnitude and " +
      "statistics, which are statistically significant at α = 0.05 level based " +
      "on Kendall nonparameter testing.";
    const p34 =
      "a statistically significant (at α = 0.05 level) decreasing trend based " +
      "on the Kendall test";
    const filler = "Background material includes various unrelated topics. ".repeat(
      76
    );
    const gap = "Additional background paragraphs provide further context. ".repeat(
      84
    );

    const passages = selectRelevantPassages(
      "What is the statistical significance level used for trend analysis?",
      {
        title: "Trend analysis of annual precipitation in China",
        content: [
          "This report describes the dataset assembled for the current work. " +
            "The following sections present background material and the complete narrative.",
          filler,
          p224,
          gap,
          p32,
          p34,
        ].join(" "),
      }
    );

    const hasMethods = passages.some((passage) =>
      passage.includes("wavelet coherence")
    );
    const hasResults = passages.some(
      (passage) => passage.includes("Kendall")
    );
    expect(passages.length).toBeGreaterThan(1);
    expect(hasMethods).toBe(true);
    expect(hasResults).toBe(true);
  });
});

describe("ranking quality", () => {
  it("ranks a clustered passage above documents with keywords scattered far apart", async () => {
    const filler =
      "Unrelated background narrative paragraphs. ".repeat(120);
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777731",
          title: "Scattered mentions",
          content: [
            `One passage mentions recurrence in passing. ${filler}`,
            `The intervals between observations were irregular. ${filler}`,
            `Durations of storms were not discussed further. ${filler}`,
            `Extreme weather caused some damage. ${filler}`,
            `Precipitation totals were not analyzed here. ${filler}`,
          ].join(" "),
        }),
        makeDocument({
          id: "77777777-7777-4777-8777-777777777732",
          title: "Clustered passage",
          content:
            "The recurrence intervals and durations of extreme precipitation events were recorded together in this passage.",
        }),
      ],
    });

    const context = await retrieve(
      "recurrence intervals durations extreme precipitation"
    );

    expect(context.items.map((item) => item.id)[0]).toBe(
      "77777777-7777-4777-8777-777777777732"
    );
  });

  it("orders equal-scoring items by title for determinism", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          id: "77777777-7777-4777-8777-777777777741",
          title: "Beta paper",
          content: "Extreme rainfall trends were observed in the study.",
        }),
        makeDocument({
          id: "77777777-7777-4777-8777-777777777742",
          title: "Alpha paper",
          content: "Extreme rainfall trends were observed in the study.",
        }),
      ],
    });

    const context = await retrieve("extreme rainfall trends");

    expect(context.items.map((item) => item.title)).toEqual([
      "Alpha paper",
      "Beta paper",
    ]);
  });

  it("returns an empty context when no item matches the question", async () => {
    mocks.getDocuments.mockResolvedValue({
      error: null,
      data: [
        makeDocument({
          content: "Maize yields across Kansas respond to fertilizer use.",
        }),
      ],
    });
    mocks.getSources.mockResolvedValue({
      error: null,
      data: [
        makeSource({ title: "Crop guide", content: "Wheat production statistics." }),
      ],
    });

    const context = await retrieve("quantum entanglement detection");

    expect(context.items).toHaveLength(0);
    expect(context.hasBodyContent).toBe(false);
  });
});

describe("duplicate source handling", () => {
  it("deduplicates sources that share a normalized URL and keeps the citable copy", async () => {
    mocks.getSources.mockResolvedValue({
      error: null,
      data: [
        makeSource({
          id: "99999999-9999-4999-8999-999999999991",
          title: "Rainfall methods guide",
          url: "https://example.com/report",
          content: "",
        }),
        makeSource({
          id: "99999999-9999-4999-8999-999999999992",
          title: "Rainfall methods guide",
          url: "https://example.com/report?utm_source=newsletter&utm_campaign=fall",
          content: "Body text describing rainfall methods and thresholds.",
        }),
        makeSource({
          id: "99999999-9999-4999-8999-999999999993",
          title: "Rainfall report",
          url: "https://example.org/rain",
          content: "",
        }),
      ],
    });

    const context = await retrieve("rainfall methods");

    const sourceItems = context.items.filter((item) => item.kind === "source");
    expect(sourceItems).toHaveLength(2);

    const kept = sourceItems.find((item) =>
      item.metadata.url?.startsWith("https://example.com/report")
    );
    expect(kept).toBeDefined();
    expect(kept!.content).toContain("Body text describing rainfall methods");
    expect(context.hasBodyContent).toBe(true);

    expect(
      sourceItems.some((item) => item.metadata.url === "https://example.org/rain")
    ).toBe(true);
  });
});
