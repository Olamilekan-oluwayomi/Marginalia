import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TAVILY_TIMEOUT_MS,
  TavilyWebSearchProvider,
} from "@/lib/search/providers/tavily";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.stubGlobal("fetch", mocks.fetch);
  vi.resetAllMocks();
  process.env.TAVILY_API_KEY = "tvly-test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TAVILY_API_KEY;
  vi.useRealTimers();
});

function tavilyResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: "A page",
    url: "https://example.com/page",
    content: "A snippet the app does not consume.",
    score: 0.9,
    ...overrides,
  };
}

function jsonResponse(
  body: unknown,
  status = 200
): Pick<Response, "ok" | "status" | "json"> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("TavilyWebSearchProvider", () => {
  it("returns normalized results and passes the query to the provider once", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        query: "climate change",
        results: [
          tavilyResult({ url: "https://example.com/one" }),
          tavilyResult({ title: "Second", url: "https://example.com/two" }),
        ],
      })
    );

    const provider = new TavilyWebSearchProvider();
    const results = await provider.search("climate change");

    expect(results).toEqual([
      { title: "A page", url: "https://example.com/one" },
      { title: "Second", url: "https://example.com/two" },
    ]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.tavily.com/search");
    expect(JSON.parse(String(init.body))).toMatchObject({
      query: "climate change",
      max_results: 5,
    });
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tvly-test-key"
    );
  });

  it("normalizes Tavily results into the app's canonical shape", async () => {
    const raw = Array.from({ length: 8 }, (_, i) =>
      tavilyResult({ title: `Title\u0000${i}`, url: `https://example.com/${i}` })
    );
    raw.push(tavilyResult({ url: "ftp://bad.example" }));
    raw.push(tavilyResult({ url: "not a url" }));
    raw.push(tavilyResult({ url: "https://example.com/1?utm_source=news" }));
    mocks.fetch.mockResolvedValue(jsonResponse({ results: raw }));

    const results = await new TavilyWebSearchProvider().search("q");

    expect(results).toHaveLength(5);
    expect(results[0]).toEqual({ title: "Title 0", url: "https://example.com/0" });
    const urls = results.map((r) => r.url);
    expect(urls).not.toContain("https://example.com/1?utm_source=news");
    expect(urls).not.toContain("ftp://bad.example");
    expect(urls).not.toContain("not a url");
    expect(urls).toHaveLength(new Set(urls).size);
  });

  it("returns an empty array when the provider returns no results", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ query: "q", results: [] }));

    const results = await new TavilyWebSearchProvider().search("q");

    expect(results).toEqual([]);
  });

  it("surfaces a provider failure without fabricating a success", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ detail: "Insufficient credits." }, 429));

    await expect(new TavilyWebSearchProvider().search("q")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Insufficient credits.",
    });
  });

  it("logs a provider failure safely without leaking the API key", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.fetch.mockRejectedValue(new Error("fetch failed"));
      const provider = new TavilyWebSearchProvider();

      await expect(provider.search("q")).rejects.toMatchObject({
        code: "PROVIDER_ERROR",
      });

      const logged = errorSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(logged).toContain("[tavily] search failed:");
      expect(logged).not.toContain("tvly-test-key");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("redacts the API key if a provider message echoes it back", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.fetch.mockRejectedValue(
        new Error("bad credential tvly-test-key rejected")
      );
      const provider = new TavilyWebSearchProvider();

      await expect(provider.search("q")).rejects.toMatchObject({
        code: "PROVIDER_ERROR",
      });

      const logged = errorSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(logged).not.toContain("tvly-test-key");
      expect(logged).toContain("[redacted]");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("surfaces a timeout as a safe provider error", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
          );
        })
    );

    const provider = new TavilyWebSearchProvider();
    const pending = provider.search("q").catch((error) => error);
    await vi.advanceTimersByTimeAsync(TAVILY_TIMEOUT_MS + 1);
    const error = await pending;

    expect(error).toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Web search timed out.",
    });
  });

  it("reports a clean configuration failure when no API key is configured", async () => {
    delete process.env.TAVILY_API_KEY;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const provider = new TavilyWebSearchProvider();

      await expect(provider.search("q")).rejects.toMatchObject({
        code: "NOT_CONFIGURED",
        message: expect.stringContaining("TAVILY_API_KEY is not set"),
      });
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
      const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(logged).toContain("tavilyApiKeyConfigured=false");
      expect(logged).not.toContain("tvly-test-key");
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("throws a PROVIDER_ERROR for a blank query", async () => {
    await expect(new TavilyWebSearchProvider().search("   ")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });
});
