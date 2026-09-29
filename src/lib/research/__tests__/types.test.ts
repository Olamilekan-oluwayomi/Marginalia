import { describe, expect, it } from "vitest";
import {
  ANSWER_STATUSES,
  DOCUMENT_STATUSES,
  SOURCE_MODES,
  toAnswerStatus,
  toDocumentStatus,
  toSourceMode,
} from "@/lib/research/types";

describe("toAnswerStatus", () => {
  it("passes through every value the answer_status constraint allows", () => {
    for (const status of ANSWER_STATUSES) {
      expect(toAnswerStatus(status)).toBe(status);
    }
  });

  it("falls back to pending for a value outside the constraint", () => {
    expect(toAnswerStatus("complete-ish")).toBe("pending");
    expect(toAnswerStatus("")).toBe("pending");
  });
});

describe("toDocumentStatus", () => {
  it("passes through every value the documents.status constraint allows", () => {
    for (const status of DOCUMENT_STATUSES) {
      expect(toDocumentStatus(status)).toBe(status);
    }
  });

  it("falls back to pending for a value outside the constraint", () => {
    expect(toDocumentStatus("uploaded")).toBe("pending");
    expect(toDocumentStatus("READY")).toBe("pending");
  });
});

describe("toSourceMode", () => {
  it("passes through every value the answers.source_mode constraint allows", () => {
    for (const mode of SOURCE_MODES) {
      expect(toSourceMode(mode)).toBe(mode);
    }
  });

  it("falls back to document for a value outside the constraint", () => {
    expect(toSourceMode("web only")).toBe("document");
    expect(toSourceMode("")).toBe("document");
  });
});
