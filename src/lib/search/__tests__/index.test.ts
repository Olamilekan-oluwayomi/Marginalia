import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchWebWithGrounding: vi.fn(),
  isAiError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({
  searchWebWithGrounding: mocks.searchWebWithGrounding,
  isAiError: mocks.isAiError,
}));

import { searchWeb } from "@/lib/search";

function groundResult(overrides: Partial<{ title: string; url: string }> = {}) {
  return { title: "A page", url: "https://example.com/page", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchWebWithGrounding.mockResolvedValue([]);
  mocks.isAiError.mockImplementation(() => false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("searchWeb", () => {
  it("throws a PROVIDER_ERROR for a blank query", async () => {
    await expect(searchWeb("   ")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });

  it("throws a PROVIDER_ERROR for an oversized query", async () => {
    await expect(searchWeb("x".repeat(501))).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });

  it("throws a PROVIDER_ERROR when the search times out", async () => {
    vi.useFakeTimers();
    mocks.searchWebWithGrounding.mockImplementation(
      () => new Promise(() => {})
    );

    let captured: unknown;
    const pending = searchWeb("a question").catch((error) => {
      captured = error;
    });
    await vi.advanceTimersByTimeAsync(15_001);
    await pending;

    expect(captured).toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Web search timed out.",
    });
  });

  it("preserves a NOT_CONFIGURED ai error", async () => {
    mocks.searchWebWithGrounding.mockRejectedValue(
      Object.assign(new Error("missing key"), { code: "NOT_CONFIGURED" })
    );
    mocks.isAiError.mockImplementation(
      (err: unknown) =>
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "NOT_CONFIGURED"
    );

    await expect(searchWeb("a question")).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });

  it("reduces other ai errors to a generic PROVIDER_ERROR", async () => {
    mocks.searchWebWithGrounding.mockRejectedValue(
      Object.assign(new Error("rate limited"), { code: "RATE_LIMITED" })
    );
    mocks.isAiError.mockImplementation(
      (err: unknown) =>
        typeof err === "object" && err !== null && "code" in (err as object)
    );

    await expect(searchWeb("a question")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Web search could not be completed.",
    });
  });

  it("reduces unknown errors to a generic PROVIDER_ERROR", async () => {
    mocks.searchWebWithGrounding.mockRejectedValue(new Error("crash"));

    await expect(searchWeb("a question")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Web search could not be completed.",
    });
  });

  it("returns an empty array when the provider returns no results", async () => {
    const results = await searchWeb("a question");

    expect(results).toEqual([]);
    expect(mocks.searchWebWithGrounding).toHaveBeenCalledWith("a question");
  });

  it("keeps only well-formed http(s) URLs", async () => {
    mocks.searchWebWithGrounding.mockResolvedValue([
      groundResult(),
      groundResult({ url: "ftp://example.com/bad" }),
      groundResult({ url: "javascript:alert(1)" }),
      groundResult({ url: "not a url" }),
    ]);

    const results = await searchWeb("a question");

    expect(results).toEqual([{ title: "A page", url: "https://example.com/page" }]);
  });

  it("deduplicates by canonical URL", async () => {
    mocks.searchWebWithGrounding.mockResolvedValue([
      groundResult({ url: "https://example.com/page" }),
      groundResult({ title: "Second", url: "https://example.com/page?utm_source=news" }),
      groundResult({ title: "Third", url: "https://EXAMPLE.com/page/" }),
    ]);

    const results = await searchWeb("a question");

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("A page");
  });

  it("sanitizes control characters in titles and caps results at five", async () => {
    const raw = Array.from({ length: 10 }, (_, i) =>
      groundResult({ title: `Title\u0000${i}`, url: `https://example.com/${i}` })
    );
    mocks.searchWebWithGrounding.mockResolvedValue(raw);

    const results = await searchWeb("a question");

    expect(results).toHaveLength(5);
    expect(results[0].title).toBe("Title 0");
  });
});
