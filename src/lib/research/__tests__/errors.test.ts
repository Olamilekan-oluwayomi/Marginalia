import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appError,
  databaseError,
  fail,
  isAppError,
  notFound,
  ok,
  toAppError,
  unauthorized,
  validationError,
} from "@/lib/research/errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("result constructors", () => {
  it("builds a successful result", () => {
    expect(ok({ id: 1 })).toEqual({ data: { id: 1 }, error: null });
  });

  it("builds a failed result with its data fallback", () => {
    const error = appError("VALIDATION_ERROR", "Bad input.");
    expect(fail(error, [])).toEqual({ data: [], error });
  });
});

describe("error factories", () => {
  it("creates each AppError with its code and message", () => {
    expect(unauthorized()).toEqual({
      code: "UNAUTHORIZED",
      message: "You must be signed in to do that.",
    });
    expect(unauthorized("Sign in required.")).toEqual({
      code: "UNAUTHORIZED",
      message: "Sign in required.",
    });
    expect(notFound()).toEqual({
      code: "NOT_FOUND",
      message: "The requested item was not found.",
    });
    expect(notFound("Gone.")).toEqual({ code: "NOT_FOUND", message: "Gone." });
    expect(validationError("Bad.")).toEqual({
      code: "VALIDATION_ERROR",
      message: "Bad.",
    });
    expect(databaseError()).toEqual({
      code: "DATABASE_ERROR",
      message: "Unable to access your data right now. Please try again.",
    });
  });
});

describe("isAppError", () => {
  it("recognizes well-formed AppError objects", () => {
    expect(isAppError({ code: "NOT_FOUND", message: "nope" })).toBe(true);
  });

  it("rejects plain values and objects missing a string message", () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError("nope")).toBe(false);
    expect(isAppError({ code: "NOT_FOUND" })).toBe(false);
    expect(isAppError({ code: "NOT_FOUND", message: 42 })).toBe(false);
  });
});

describe("toAppError", () => {
  it("passes an existing AppError through unchanged", () => {
    const error = unauthorized("Sign in required.");
    expect(toAppError(error)).toBe(error);
  });

  it("logs only the message from a raw database error and returns a safe generic error", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = {
      code: "22P02",
      message: "invalid input syntax for type uuid",
      details: "some row data that must never leak",
      hint: "Check your query.",
    };

    const result = toAppError(raw);

    expect(result.code).toBe("DATABASE_ERROR");
    expect(result.message).not.toContain("invalid input syntax");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[research-data] database error:",
      "invalid input syntax for type uuid"
    );
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("row data");
  });

  it("uses Error.message for thrown Error instances", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = toAppError(new Error("connection refused"));
    expect(result.code).toBe("DATABASE_ERROR");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[research-data] database error:",
      "connection refused"
    );
  });

  it("never logs the raw object, only the message field", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = { message: "only this", hint: "secret hint", details: "secret detail" };
    toAppError(raw);
    const logged = JSON.stringify(consoleSpy.mock.calls[0]);
    expect(logged).toContain("only this");
    expect(logged).not.toContain("secret hint");
    expect(logged).not.toContain("secret detail");
  });

  it("falls back to a safe label when the error carries no message", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = toAppError({ code: "500" });
    expect(result.message).toBe(
      "Unable to access your data right now. Please try again."
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[research-data] database error:",
      "Unknown database error."
    );
  });
});
