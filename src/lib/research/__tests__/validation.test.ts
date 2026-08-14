import { describe, expect, it } from "vitest";
import {
  exactlyOneProvided,
  optionalDate,
  optionalText,
  requireNumber,
  requireOneOf,
  requireText,
  requireUuid,
} from "@/lib/research/validation";

describe("requireText", () => {
  it("rejects missing, non-string, and whitespace-only values", () => {
    expect(requireText(undefined, "Title")).toEqual({
      field: "Title",
      message: "Title is required.",
    });
    expect(requireText(null, "Title")).toEqual({
      field: "Title",
      message: "Title is required.",
    });
    expect(requireText(42, "Title")).toEqual({
      field: "Title",
      message: "Title is required.",
    });
    expect(requireText("   ", "Title")).toEqual({
      field: "Title",
      message: "Title is required.",
    });
  });

  it("accepts a trimmed non-empty string", () => {
    expect(requireText("A title", "Title")).toBeNull();
  });

  it("enforces the max length on the untrimmed value", () => {
    expect(requireText("12345", "Title", 4)).toEqual({
      field: "Title",
      message: "Title must be 4 characters or fewer.",
    });
    expect(requireText("1234", "Title", 4)).toBeNull();
  });
});

describe("optionalText", () => {
  it("accepts undefined, null, and empty string", () => {
    expect(optionalText(undefined, "Description")).toBeNull();
    expect(optionalText(null, "Description")).toBeNull();
    expect(optionalText("", "Description")).toBeNull();
  });

  it("rejects non-string values", () => {
    expect(optionalText(123, "Description")).toEqual({
      field: "Description",
      message: "Description must be text.",
    });
  });

  it("enforces the max length when provided", () => {
    expect(optionalText("toolong", "Description", 3)).toEqual({
      field: "Description",
      message: "Description must be 3 characters or fewer.",
    });
  });
});

describe("requireNumber", () => {
  it("rejects non-numbers and NaN", () => {
    expect(requireNumber("3", "Count")).toEqual({
      field: "Count",
      message: "Count must be a number.",
    });
    expect(requireNumber(Number.NaN, "Count")).toEqual({
      field: "Count",
      message: "Count must be a number.",
    });
  });

  it("accepts a number and enforces an optional minimum", () => {
    expect(requireNumber(3, "Count")).toBeNull();
    expect(requireNumber(0, "Citation number", { min: 1 })).toEqual({
      field: "Citation number",
      message: "Citation number must be at least 1.",
    });
    expect(requireNumber(1, "Citation number", { min: 1 })).toBeNull();
  });
});

describe("requireOneOf", () => {
  it("accepts an allowed value", () => {
    expect(requireOneOf("ready", ["pending", "ready"], "Status")).toBeNull();
  });

  it("rejects a value outside the allowed set or a non-string", () => {
    expect(requireOneOf("complete", ["pending", "ready"], "Status")).toEqual({
      field: "Status",
      message: "Status is invalid.",
    });
    expect(requireOneOf(42, ["pending", "ready"], "Status")).toEqual({
      field: "Status",
      message: "Status is invalid.",
    });
  });
});

describe("requireUuid", () => {
  it("accepts a well-formed uuid v4-style identifier", () => {
    expect(requireUuid("11111111-1111-4111-8111-111111111111", "Question id")).toBeNull();
    expect(requireUuid("11111111-1111-4111-8111-111111111111", "Question id")).toBeNull();
  });

  it("rejects non-strings and malformed identifiers", () => {
    expect(requireUuid(undefined, "Question id")).toEqual({
      field: "Question id",
      message: "Question id must be a valid identifier.",
    });
    expect(requireUuid("not-a-uuid", "Question id")).toEqual({
      field: "Question id",
      message: "Question id must be a valid identifier.",
    });
    expect(requireUuid("", "Question id")).toEqual({
      field: "Question id",
      message: "Question id must be a valid identifier.",
    });
    expect(requireUuid("11111111-1111-4111-8111", "Question id")).toEqual({
      field: "Question id",
      message: "Question id must be a valid identifier.",
    });
  });
});

describe("optionalDate", () => {
  it("accepts undefined, null, and empty string", () => {
    expect(optionalDate(undefined, "Retrieved at")).toBeNull();
    expect(optionalDate(null, "Retrieved at")).toBeNull();
    expect(optionalDate("", "Retrieved at")).toBeNull();
  });

  it("accepts a parseable ISO date string", () => {
    expect(optionalDate("2026-08-13", "Retrieved at")).toBeNull();
    expect(optionalDate("2026-08-13T00:00:00.000Z", "Retrieved at")).toBeNull();
  });

  it("rejects non-string and unparseable values", () => {
    expect(optionalDate(123, "Retrieved at")).toEqual({
      field: "Retrieved at",
      message: "Retrieved at must be a valid date.",
    });
    expect(optionalDate("not a date", "Retrieved at")).toEqual({
      field: "Retrieved at",
      message: "Retrieved at must be a valid date.",
    });
  });
});

describe("exactlyOneProvided", () => {
  it("accepts exactly one provided value", () => {
    expect(
      exactlyOneProvided([
        { name: "document_id", value: "doc-1" },
        { name: "source_id", value: undefined },
      ])
    ).toBeNull();
  });

  it("rejects both or neither", () => {
    const both = exactlyOneProvided([
      { name: "document_id", value: "doc-1" },
      { name: "source_id", value: "src-1" },
    ]);
    expect(both?.field).toBe("document_id/source_id");
    expect(both?.message).toContain("exactly one");

    const neither = exactlyOneProvided([
      { name: "document_id", value: undefined },
      { name: "source_id", value: null },
    ]);
    expect(neither?.message).toContain("exactly one");
  });
});
