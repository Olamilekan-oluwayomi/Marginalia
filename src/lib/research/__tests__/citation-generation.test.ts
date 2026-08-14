import { describe, expect, it } from "vitest";
import {
  parseGeneratedAnswerOutput,
  resolveCitations,
  type GeneratedAnswerOutput,
} from "@/lib/research/citation-generation";
import type { ResearchContext } from "@/lib/research/context";

function documentContext(
  id: string,
  content: string
): ResearchContext {
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
    const result = parseGeneratedAnswerOutput({ answer: "Plain answer.", citations: [] });

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

describe("resolveCitations", () => {
  it("resolves a citation to a document with body content", () => {
    const output: GeneratedAnswerOutput = {
      answer: "text",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const result = resolveCitations(output, documentContext("doc-1", "body text"));
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
    ]);
    expect(result.rejectedCount).toBe(0);
  });

  it("rejects an evidence index outside the provided context", () => {
    const output: GeneratedAnswerOutput = {
      answer: "text",
      citations: [{ citation_number: 1, evidence: 9 }],
    };

    const result = resolveCitations(output, documentContext("doc-1", "body text"));
    expect(result.citations).toEqual([]);
    expect(result.rejectedCount).toBe(1);
  });

  it("rejects citations to items with no body content", () => {
    const output: GeneratedAnswerOutput = {
      answer: "text",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const result = resolveCitations(output, documentContext("doc-1", ""));
    expect(result.citations).toEqual([]);
    expect(result.rejectedCount).toBe(1);
  });

  it("drops only the citation that points at a metadata-only source and keeps the document citation", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "document",
          id: "doc-1",
          title: "A document",
          content: "body text",
          metadata: { file_name: "a.pdf", mime_type: "application/pdf" },
        },
        {
          kind: "source",
          id: "src-1",
          title: "A web result",
          content: "",
          metadata: { publisher: "Web search", url: "https://example.com" },
        },
      ],
      hasBodyContent: true,
    };

    const output: GeneratedAnswerOutput = {
      answer: "text with [1] and [2]",
      citations: [
        { citation_number: 1, evidence: 1 },
        { citation_number: 2, evidence: 2 },
      ],
    };

    const result = resolveCitations(output, context);
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
    ]);
    expect(result.rejectedCount).toBe(1);
  });

  it("resolves sources to source_id and keeps citation order", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "source",
          id: "src-1",
          title: "A source",
          content: "body",
          metadata: { publisher: "Pub", url: "https://example.com" },
        },
        {
          kind: "document",
          id: "doc-1",
          title: "A document",
          content: "body",
          metadata: {},
        },
      ],
      hasBodyContent: true,
    };

    const output: GeneratedAnswerOutput = {
      answer: "text",
      citations: [
        { citation_number: 2, evidence: 1 },
        { citation_number: 1, evidence: 2 },
      ],
    };

    const result = resolveCitations(output, context);
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
      { citation_number: 2, source_id: "src-1" },
    ]);
    expect(result.rejectedCount).toBe(0);
  });

  it("keeps a valid single-item citation and its marker in the answer", () => {
    const output: GeneratedAnswerOutput = {
      answer: "A significance level of 0.05 was used [1].",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const result = resolveCitations(
      output,
      documentContext("doc-1", "alpha of 0.05 was used for every trend analysis.")
    );
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
    ]);
    expect(result.rejectedCount).toBe(0);
    expect(result.answer).toBe("A significance level of 0.05 was used [1].");
  });

  it("drops an out-of-range citation and removes its dangling marker from the answer", () => {
    const output: GeneratedAnswerOutput = {
      answer: "A significance level of 0.05 was used [2].",
      citations: [{ citation_number: 2, evidence: 2 }],
    };

    const result = resolveCitations(
      output,
      documentContext("doc-1", "alpha of 0.05 was used for every trend analysis.")
    );
    expect(result.citations).toEqual([]);
    expect(result.rejectedCount).toBe(1);
    expect(result.answer).toBe("A significance level of 0.05 was used.");
  });

  it("resolves evidence 2 to the second context item", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "document",
          id: "doc-1",
          title: "A document",
          content: "body",
          metadata: { file_name: "a.pdf", mime_type: "application/pdf" },
        },
        {
          kind: "source",
          id: "src-1",
          title: "A source",
          content: "body",
          metadata: { publisher: "Pub", url: "https://example.com" },
        },
      ],
      hasBodyContent: true,
    };

    const output: GeneratedAnswerOutput = {
      answer: "The second item supports this [1].",
      citations: [{ citation_number: 1, evidence: 2 }],
    };

    const result = resolveCitations(output, context);
    expect(result.citations).toEqual([
      { citation_number: 1, source_id: "src-1" },
    ]);
    expect(result.rejectedCount).toBe(0);
    expect(result.answer).toBe("The second item supports this [1].");
  });

  it("resolves multiple citations against the same document", () => {
    const output: GeneratedAnswerOutput = {
      answer: "First finding [1], then a second one [2].",
      citations: [
        { citation_number: 1, evidence: 1 },
        { citation_number: 2, evidence: 1 },
      ],
    };

    const result = resolveCitations(
      output,
      documentContext("doc-1", "body text")
    );
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
      { citation_number: 2, document_id: "doc-1" },
    ]);
    expect(result.rejectedCount).toBe(0);
  });

  it("keeps valid markers and strips an invalid [2] when only evidence 1 exists", () => {
    const output: GeneratedAnswerOutput = {
      answer: "The level was 0.05 [1] for the trend analysis [2].",
      citations: [
        { citation_number: 1, evidence: 1 },
        { citation_number: 2, evidence: 2 },
      ],
    };

    const result = resolveCitations(
      output,
      documentContext("doc-1", "alpha of 0.05 was used for every trend analysis.")
    );
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
    ]);
    expect(result.rejectedCount).toBe(1);
    expect(result.answer).toBe("The level was 0.05 [1] for the trend analysis.");
  });

  it("strips a marker that has no corresponding citation entry", () => {
    const output: GeneratedAnswerOutput = {
      answer: "A claim with no source [3] here.",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const result = resolveCitations(
      output,
      documentContext("doc-1", "body text")
    );
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
    ]);
    expect(result.answer).toBe("A claim with no source here.");
  });

  it("converts a bare sentence-final integer into a clickable marker when it resolves", () => {
    const output: GeneratedAnswerOutput = {
      answer: "These changes were driven by atmospheric circulation anomalies 1.",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const result = resolveCitations(
      output,
      documentContext("doc-1", "atmospheric circulation anomalies were linked to these changes.")
    );
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
    ]);
    expect(result.rejectedCount).toBe(0);
    expect(result.answer).toBe(
      "These changes were driven by atmospheric circulation anomalies [1]."
    );
  });

  it("removes a bare sentence-final integer that resolves to no citation", () => {
    const output: GeneratedAnswerOutput = {
      answer: "A claim with no supporting evidence 3.",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const result = resolveCitations(
      output,
      documentContext("doc-1", "body text")
    );
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
    ]);
    expect(result.rejectedCount).toBe(0);
    expect(result.answer).toBe("A claim with no supporting evidence.");
  });

  it("leaves inline numbers and multi-digit sentence-final values untouched", () => {
    const output: GeneratedAnswerOutput = {
      answer:
        "Trends were evaluated at a significance level of 0.05. Recurrence intervals of 1, 5 and 10 years and durations of 1, 5, 10 and 30 days were used 1. The record covers the period from 1961 to 2018.",
      citations: [{ citation_number: 1, evidence: 1 }],
    };

    const result = resolveCitations(
      output,
      documentContext("doc-1", "body text")
    );
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
    ]);
    expect(result.rejectedCount).toBe(0);
    expect(result.answer).toBe(
      "Trends were evaluated at a significance level of 0.05. Recurrence intervals of 1, 5 and 10 years and durations of 1, 5, 10 and 30 days were used [1]. The record covers the period from 1961 to 2018."
    );
  });

  it("resolves two independent context items to their own document ids", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "document",
          id: "doc-1",
          title: "D1",
          content: "body one",
          metadata: {},
        },
        {
          kind: "document",
          id: "doc-2",
          title: "D2",
          content: "body two",
          metadata: {},
        },
      ],
      hasBodyContent: true,
    };

    const output: GeneratedAnswerOutput = {
      answer: "First [1] and second [2].",
      citations: [
        { citation_number: 1, evidence: 1 },
        { citation_number: 2, evidence: 2 },
      ],
    };

    const result = resolveCitations(output, context);
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
      { citation_number: 2, document_id: "doc-2" },
    ]);
    expect(result.rejectedCount).toBe(0);
    expect(result.answer).toBe("First [1] and second [2].");
  });

  it("rejects zero and negative evidence indexes at resolution time", () => {
    const context = documentContext("doc-1", "body");
    for (const evidence of [0, -1, -5]) {
      const output: GeneratedAnswerOutput = {
        answer: "text",
        citations: [{ citation_number: 1, evidence }],
      };
      const result = resolveCitations(output, context);
      expect(result.citations).toEqual([]);
      expect(result.rejectedCount).toBe(1);
    }
  });

  it("rejects an evidence index beyond the last context item", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "document",
          id: "doc-1",
          title: "D1",
          content: "body",
          metadata: {},
        },
        {
          kind: "document",
          id: "doc-2",
          title: "D2",
          content: "body",
          metadata: {},
        },
      ],
      hasBodyContent: true,
    };

    const output: GeneratedAnswerOutput = {
      answer: "text",
      citations: [{ citation_number: 1, evidence: 3 }],
    };

    const result = resolveCitations(output, context);
    expect(result.citations).toEqual([]);
    expect(result.rejectedCount).toBe(1);
  });

  it("resolves a document and a web source independently when both carry content", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "document",
          id: "doc-1",
          title: "D",
          content: "doc body",
          metadata: {},
        },
        {
          kind: "source",
          id: "src-1",
          title: "S",
          content: "source body",
          metadata: { publisher: "Web search", url: "https://example.com" },
        },
      ],
      hasBodyContent: true,
    };

    const output: GeneratedAnswerOutput = {
      answer: "text",
      citations: [
        { citation_number: 1, evidence: 1 },
        { citation_number: 2, evidence: 2 },
      ],
    };

    const result = resolveCitations(output, context);
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
      { citation_number: 2, source_id: "src-1" },
    ]);
    expect(result.rejectedCount).toBe(0);
  });

  it("maps a same-document primary and secondary passage to the same document id at their own evidence indexes", () => {
    const context: ResearchContext = {
      items: [
        {
          kind: "document",
          id: "doc-1",
          title: "Extreme precipitation paper",
          content: "In this study, we used daily rainfall data from 52 stations.",
          metadata: {},
        },
        {
          kind: "document",
          id: "doc-1",
          title: "Extreme precipitation paper",
          content:
            "The results showed increasing trends in extreme precipitation across most stations.",
          metadata: {},
        },
      ],
      hasBodyContent: true,
    };

    const output: GeneratedAnswerOutput = {
      answer: "The authors used 52 stations [1] and found increasing trends [2].",
      citations: [
        { citation_number: 1, evidence: 1 },
        { citation_number: 2, evidence: 2 },
      ],
    };

    const result = resolveCitations(output, context);
    expect(result.citations).toEqual([
      { citation_number: 1, document_id: "doc-1" },
      { citation_number: 2, document_id: "doc-1" },
    ]);
    expect(result.rejectedCount).toBe(0);
    expect(result.answer).toBe(
      "The authors used 52 stations [1] and found increasing trends [2]."
    );
  });
});
