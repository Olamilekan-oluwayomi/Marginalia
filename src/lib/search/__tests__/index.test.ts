import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tavilySearch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/search/providers/tavily", () => ({
  TavilyWebSearchProvider: class {
    search = mocks.tavilySearch;
  },
}));

import { searchError } from "@/lib/search/errors";
import { searchWeb } from "@/lib/search";

function groundResult(overrides: Partial<{ title: string; url: string }> = {}) {
  return { title: "A page", url: "https://example.com/page", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tavilySearch.mockResolvedValue([]);
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
    mocks.tavilySearch.mockImplementation(() => new Promise(() => {}));

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

  it("preserves a NOT_CONFIGURED provider error", async () => {
    mocks.tavilySearch.mockRejectedValue(
      searchError("NOT_CONFIGURED", "TAVILY_API_KEY is not set.")
    );

    await expect(searchWeb("a question")).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });

  it("passes a provider PROVIDER_ERROR through with its cause", async () => {
    mocks.tavilySearch.mockRejectedValue(
      searchError("PROVIDER_ERROR", "Insufficient credits.")
    );

    await expect(searchWeb("a question")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Insufficient credits.",
    });
  });

  it("reduces unknown errors to a generic PROVIDER_ERROR", async () => {
    mocks.tavilySearch.mockRejectedValue(new Error("crash"));

    await expect(searchWeb("a question")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Web search could not be completed.",
    });
  });

  it("returns an empty array when the provider returns no results", async () => {
    const results = await searchWeb("a question");

    expect(results).toEqual([]);
    expect(mocks.tavilySearch).toHaveBeenCalledOnce();
    expect(mocks.tavilySearch).toHaveBeenCalledWith("a question");
  });

  it("keeps only well-formed http(s) URLs", async () => {
    mocks.tavilySearch.mockResolvedValue([
      groundResult(),
      groundResult({ url: "ftp://example.com/bad" }),
      groundResult({ url: "javascript:alert(1)" }),
      groundResult({ url: "not a url" }),
    ]);

    const results = await searchWeb("a question");

    expect(results).toEqual([{ title: "A page", url: "https://example.com/page" }]);
  });

  it("deduplicates by canonical URL", async () => {
    mocks.tavilySearch.mockResolvedValue([
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
    mocks.tavilySearch.mockResolvedValue(raw);

    const results = await searchWeb("a question");

    expect(results).toHaveLength(5);
    expect(results[0].title).toBe("Title 0");
  });
});
