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
});
