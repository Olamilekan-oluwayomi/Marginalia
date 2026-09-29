import { describe, expect, it } from "vitest";
import {
  parseGeneratedAnswerOutput,
  sanitizeAnswerMarkers,
  toAnswerCitations,
  type GeneratedAnswerOutput,
} from "@/lib/research/citation-generation";
import type { ResearchContext } from "@/lib/research/context";

function documentContext(id: string, content: string): ResearchContext {
  return {
    items: [
      {
        kind: "document",
        id,
        title: "A document",
        content,
        metadata: { file_name: "a.txt", mime_type: "text/plain" },
      },
    ],
    hasBodyContent: content.trim().length > 0,
  };
}

describe("parseGeneratedAnswerOutput", () => {
  it("accepts a valid answer with citations", () => {
    const result = parseGeneratedAnswerOutput({
      answer: "  Paris is the capital of France.  ",
      citations: [{ citation_number: 1, evidence: 1 }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.answer).toBe("Paris is the capital of France.");
      expect(result.output.citations).toEqual([
        { citation_number: 1, evidence: 1 },
      ]);
    }
  });

  it("accepts an empty citations array", () => {
    const result = parseGeneratedAnswerOutput({
      answer: "Plain answer.",
      citations: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.citations).toEqual([]);
    }
  });

  it("rejects a non-object payload", () => {
    const result = parseGeneratedAnswerOutput("just text");
    expect(result.ok).toBe(false);
  });

  it("rejects a missing citations array", () => {
    const result = parseGeneratedAnswerOutput({ answer: "text" });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty answer", () => {
    const result = parseGeneratedAnswerOutput({ answer: "   ", citations: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-string answer", () => {
    const result = parseGeneratedAnswerOutput({ answer: 42, citations: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate citation numbers", () => {
    const result = parseGeneratedAnswerOutput({
      answer: "text",
      citations: [
        { citation_number: 1, evidence: 1 },
        { citation_number: 1, evidence: 2 },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects citation numbers that are not positive integers", () => {
    const result = parseGeneratedAnswerOutput({
      answer: "text",
      citations: [{ citation_number: 0, evidence: 1 }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects evidence indexes that are not positive integers", () => {
    const result = parseGeneratedAnswerOutput({
      answer: "text",
      citations: [{ citation_number: 1, evidence: 1.5 }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("toAnswerCitations", () => {
  it("maps a document citation into the Citation schema with server-derived fields", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "document",
          id: "doc-1",
          title: "Extreme precipitation paper",
          content:
            "A significance level of 0.05 was used for every trend analysis.",
          metadata: { file_name: "paper.pdf", mime_type: "application/pdf" },
        },
      ],
      hasBodyContent: true,
    };

    const output: GeneratedAnswerOutput = {
      answer: "A significance level of 0.05 was used [1].",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const result = toAnswerCitations(output, context);
    expect(result.citations).toEqual([
      expect.objectContaining({
        citation_number: 1,
        type: "document",
        documentId: "doc-1",
        documentTitle: "Extreme precipitation paper",
        chunkId: expect.stringMatching(/^passage-doc-1-/),
        snippet:
          "A significance level of 0.05 was used for every trend analysis.",
      }),
    ]);
    expect(result.rejectedCount).toBe(0);
  });

  it("produces a stable chunk id for identical passages", () => {
    const context = documentContext(
      "doc-1",
      "The results showed increasing trends across most stations.",
    );
    const output: GeneratedAnswerOutput = {
      answer: "text",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const first = toAnswerCitations(output, context);
    const second = toAnswerCitations(output, context);
    expect(first.citations[0]).toHaveProperty("chunkId");
    expect(first.citations[0]).toEqual(second.citations[0]);
  });

  it("maps a source with body text into a web citation", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "source",
          id: "src-1",
          title: "Extreme precipitation trends",
          content: "Annual maxima are increasing across the region.",
          metadata: {
            publisher: "Web search",
            url: "https://example.com/trends",
          },
        },
      ],
      hasBodyContent: true,
    };

    const output: GeneratedAnswerOutput = {
      answer: "Annual maxima are increasing [1].",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const result = toAnswerCitations(output, context);
    expect(result.citations).toEqual([
      {
        citation_number: 1,
        type: "web",
        sourceId: "src-1",
        url: "https://example.com/trends",
        title: "Extreme precipitation trends",
        snippet: "Annual maxima are increasing across the region.",
      },
    ]);
    expect(result.rejectedCount).toBe(0);
  });

  it("keeps marker order and cites each evidence passage at its own index", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "document",
          id: "doc-1",
          title: "Extreme precipitation paper",
          content: "We used daily rainfall data from 52 stations.",
          metadata: {},
        },
        {
          kind: "document",
          id: "doc-1",
          title: "Extreme precipitation paper",
          content: "The results showed increasing trends across most stations.",
          metadata: {},
        },
      ],
      hasBodyContent: true,
    };

    const output: GeneratedAnswerOutput = {
      answer: "text",
      citations: [
        { citation_number: 2, evidence: 2 },
        { citation_number: 1, evidence: 1 },
      ],
    };

    const result = toAnswerCitations(output, context);
    expect(result.citations).toEqual([
      expect.objectContaining({
        citation_number: 1,
        type: "document",
        documentId: "doc-1",
        documentTitle: "Extreme precipitation paper",
        chunkId: expect.stringMatching(/^passage-doc-1-/),
        snippet: "We used daily rainfall data from 52 stations.",
      }),
      expect.objectContaining({
        citation_number: 2,
        type: "document",
        documentId: "doc-1",
        documentTitle: "Extreme precipitation paper",
        chunkId: expect.stringMatching(/^passage-doc-1-/),
        snippet: "The results showed increasing trends across most stations.",
      }),
    ]);
    expect(result.rejectedCount).toBe(0);
  });

  it("rejects evidence outside the context and document items without body content", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "document",
          id: "doc-1",
          title: "A document",
          content: "body text",
          metadata: {},
        },
        {
          kind: "document",
          id: "doc-2",
          title: "Empty document",
          content: "",
          metadata: {},
        },
      ],
      hasBodyContent: true,
    };

    const output: GeneratedAnswerOutput = {
      answer: "text",
      citations: [
        { citation_number: 1, evidence: 1 },
        { citation_number: 2, evidence: 2 },
        { citation_number: 3, evidence: 9 },
      ],
    };

    const result = toAnswerCitations(output, context);
    expect(result.citations).toEqual([
      expect.objectContaining({
        citation_number: 1,
        type: "document",
        documentId: "doc-1",
        documentTitle: "A document",
        chunkId: expect.stringMatching(/^passage-doc-1-/),
        snippet: "body text",
      }),
    ]);
    expect(result.rejectedCount).toBe(2);
  });

  it("resolves a web research result (URL-only source) into a web citation with the claim sentence as snippet", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "source",
          id: "src-1",
          title: "Extreme precipitation trends",
          content: "",
          metadata: {
            publisher: "Web search",
            url: "https://example.com/trends",
          },
        },
      ],
      hasBodyContent: false,
    };

    const output: GeneratedAnswerOutput = {
      answer:
        "Annual maxima are increasing across the region [1]. The trend is strongest in autumn.",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const result = toAnswerCitations(output, context);
    expect(result.citations).toEqual([
      {
        citation_number: 1,
        type: "web",
        sourceId: "src-1",
        url: "https://example.com/trends",
        title: "Extreme precipitation trends",
        snippet: "Annual maxima are increasing across the region [1].",
      },
    ]);
    expect(result.rejectedCount).toBe(0);
  });

  it("rejects a source with neither a URL nor body content", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "source",
          id: "src-1",
          title: "Bare source",
          content: "",
          metadata: {},
        },
      ],
      hasBodyContent: false,
    };

    const output: GeneratedAnswerOutput = {
      answer: "text",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const result = toAnswerCitations(output, context);
    expect(result.citations).toEqual([]);
    expect(result.rejectedCount).toBe(1);
  });
});

describe("sanitizeAnswerMarkers", () => {
  it("repairs a bare sentence-final integer into a marker when it resolves", () => {
    expect(
      sanitizeAnswerMarkers(
        "These changes were driven by atmospheric circulation anomalies 1.",
        [{ citation_number: 1 }],
      ),
    ).toBe(
      "These changes were driven by atmospheric circulation anomalies [1].",
    );
  });

  it("strips the marker of a citation that was dropped", () => {
    expect(
      sanitizeAnswerMarkers("A claim with no source [2] here.", [
        { citation_number: 1 },
      ]),
    ).toBe("A claim with no source here.");
  });

  it("leaves a clean answer with resolved markers untouched", () => {
    expect(
      sanitizeAnswerMarkers("First [1] and second [2].", [
        { citation_number: 1 },
        { citation_number: 2 },
      ]),
    ).toBe("First [1] and second [2].");
  });

  it("repairs and strips in the same pass", () => {
    expect(
      sanitizeAnswerMarkers(
        "Wet days grew in frequency 1. Seasonal totals were stable [3].",
        [{ citation_number: 1 }],
      ),
    ).toBe("Wet days grew in frequency [1]. Seasonal totals were stable.");
  });
});
