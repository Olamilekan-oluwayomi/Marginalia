import { describe, expect, it } from "vitest";
import {
  splitAnswerMarkers,
  splitAnswerParagraphs,
  stripCitationMarkers,
} from "@/lib/research/answer-format";

describe("splitAnswerParagraphs", () => {
  it("splits on blank lines and trims each paragraph", () => {
    expect(
      splitAnswerParagraphs(
        "  First paragraph.\n\n   Second paragraph with [1].  \n\nThird [2]."
      )
    ).toEqual([
      "First paragraph.",
      "Second paragraph with [1].",
      "Third [2].",
    ]);
  });

  it("ignores whitespace-only separators and drops empty paragraphs", () => {
    expect(
      splitAnswerParagraphs("\n\n   \nParagraph only.\n\n\n\n")
    ).toEqual(["Paragraph only."]);
  });

  it("returns an empty array for empty or whitespace-only content", () => {
    expect(splitAnswerParagraphs("")).toEqual([]);
    expect(splitAnswerParagraphs("   \n\n  ")).toEqual([]);
  });
});

describe("splitAnswerMarkers", () => {
  it("turns standalone [n] pieces into marker segments", () => {
    expect(splitAnswerMarkers("See [1] and [12] for detail.")).toEqual([
      { kind: "text", text: "See " },
      { kind: "marker", number: 1 },
      { kind: "text", text: " and " },
      { kind: "marker", number: 12 },
      { kind: "text", text: " for detail." },
    ]);
  });

  it("keeps an unresolved marker list as plain text when nothing follows it", () => {
    expect(splitAnswerMarkers("Sources: [1]")).toEqual([
      { kind: "text", text: "Sources: " },
      { kind: "marker", number: 1 },
    ]);
  });

  it("keeps non-numeric brackets as plain text", () => {
    expect(
      splitAnswerMarkers("The file [draft].pdf is in the attachments.")
    ).toEqual([
      { kind: "text", text: "The file [draft].pdf is in the attachments." },
    ]);
  });

  it("treats leading zeros in markers as a single number", () => {
    expect(splitAnswerMarkers("Per [007]")).toEqual([
      { kind: "text", text: "Per " },
      { kind: "marker", number: 7 },
    ]);
  });

  it("returns plain text segments for a paragraph without markers", () => {
    expect(splitAnswerMarkers("Just prose.")).toEqual([
      { kind: "text", text: "Just prose." },
    ]);
  });
});

describe("stripCitationMarkers", () => {
  it("removes inline [n] markers and collapses the leftover whitespace", () => {
    expect(
      stripCitationMarkers(
        "Annual maxima are increasing across the region [1]."
      )
    ).toBe("Annual maxima are increasing across the region.");
  });

  it("leaves text without markers untouched", () => {
    expect(
      stripCitationMarkers("The body text of a source citation.")
    ).toBe("The body text of a source citation.");
  });

  it("keeps non-marker bracketed text", () => {
    expect(stripCitationMarkers("The file [draft].pdf is attached.")).toBe(
      "The file [draft].pdf is attached."
    );
  });
});
