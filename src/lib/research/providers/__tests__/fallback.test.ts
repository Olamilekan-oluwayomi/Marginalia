import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({
  isAiError: (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string",
}));

import { isLlmFallbackEligible } from "@/lib/research/providers/fallback";
import { appError } from "@/lib/research/errors";

const aiErrorLike = (overrides: Record<string, unknown>) => ({
  code: "PROVIDER_ERROR",
  message: "boom",
  ...overrides,
});

describe("isLlmFallbackEligible", () => {
  it("returns true for transient HTTP statuses", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isLlmFallbackEligible(aiErrorLike({ status }))).toBe(true);
    }
  });

  it("returns false for non-transient HTTP statuses", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(isLlmFallbackEligible(aiErrorLike({ status }))).toBe(false);
    }
  });

  it("returns true for transient RPC codes", () => {
    for (const rpcCode of [
      "RESOURCE_EXHAUSTED",
      "RATE_LIMITED",
      "UNAVAILABLE",
      "INTERNAL",
    ]) {
      expect(isLlmFallbackEligible(aiErrorLike({ rpcCode }))).toBe(true);
    }
  });

  it("returns false for non-transient RPC codes", () => {
    for (const rpcCode of [
      "INVALID_ARGUMENT",
      "NOT_FOUND",
      "PERMISSION_DENIED",
      "DEADLINE_EXCEEDED",
    ]) {
      expect(isLlmFallbackEligible(aiErrorLike({ rpcCode }))).toBe(false);
    }
  });

  it("returns false for bare provider errors without transient markers", () => {
    expect(isLlmFallbackEligible(aiErrorLike({}))).toBe(false);
  });

  it("returns false for permanent AiError codes", () => {
    expect(
      isLlmFallbackEligible({ code: "INVALID_INPUT", message: "too long" })
    ).toBe(false);
    expect(
      isLlmFallbackEligible({
        code: "INVALID_RESPONSE",
        message: "malformed JSON",
      })
    ).toBe(false);
    expect(
      isLlmFallbackEligible({ code: "NOT_CONFIGURED", message: "no key" })
    ).toBe(false);
  });

  it("returns false for AppErrors", () => {
    expect(isLlmFallbackEligible(appError("DATABASE_ERROR", "nope"))).toBe(
      false
    );
  });

  it("classifies raw provider failures that were never normalized", () => {
    expect(isLlmFallbackEligible({ status: 429 })).toBe(true);
    expect(isLlmFallbackEligible({ error: { code: "RESOURCE_EXHAUSTED" } })).toBe(
      true
    );
    expect(isLlmFallbackEligible({ code: "UNAVAILABLE" })).toBe(true);
    expect(isLlmFallbackEligible({ error: { code: "NOT_FOUND" } })).toBe(false);
    expect(isLlmFallbackEligible({ status: "429" })).toBe(false);
  });

  it("returns false for anything that is not an object", () => {
    expect(isLlmFallbackEligible(null)).toBe(false);
    expect(isLlmFallbackEligible(undefined)).toBe(false);
    expect(isLlmFallbackEligible("boom")).toBe(false);
    expect(isLlmFallbackEligible(new Error("boom"))).toBe(false);
  });
});
