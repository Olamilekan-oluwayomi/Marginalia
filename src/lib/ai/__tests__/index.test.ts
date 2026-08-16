import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MODEL,
  GENERATION_RETRY_ATTEMPTS,
  MAX_PROMPT_CHARS,
  MAX_SYSTEM_CHARS,
  aiError,
  generateJson,
  generateText,
  isTransientProviderError,
  searchWebWithGrounding,
  toAiError,
} from "@/lib/ai";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/client", () => ({
  getAiClient: () => ({ models: { generateContent: mocks.generateContent } }),
}));

describe("generateText", () => {
  beforeEach(() => {
    mocks.generateContent.mockReset();
  });

  it("returns the provider text", async () => {
    mocks.generateContent.mockResolvedValue({ text: "Hello" });

    await expect(generateText({ prompt: "hi" })).resolves.toBe("Hello");
  });

  it("uses the default model when none is supplied", async () => {
    mocks.generateContent.mockResolvedValue({ text: "Hello" });

    await generateText({ prompt: "hi" });

    expect(mocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: DEFAULT_MODEL })
    );
  });

  it("rejects with PROVIDER_ERROR on an empty response", async () => {
    mocks.generateContent.mockResolvedValue({ text: "   " });

    await expect(generateText({ prompt: "hi" })).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });

  it("rejects with INVALID_INPUT without calling the provider for an oversized prompt", async () => {
    await expect(
      generateText({ prompt: "x".repeat(MAX_PROMPT_CHARS + 1) })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("rejects with INVALID_INPUT without calling the provider for an oversized system instruction", async () => {
    await expect(
      generateText({
        prompt: "hi",
        system: "x".repeat(MAX_SYSTEM_CHARS + 1),
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("rejects with a safe PROVIDER_ERROR when the provider times out", async () => {
    mocks.generateContent.mockReturnValue(new Promise(() => {}));

    await expect(
      generateText({ prompt: "hi", timeoutMs: 5 })
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});

describe("generateJson", () => {
  beforeEach(() => {
    mocks.generateContent.mockReset();
  });

  it("parses a valid JSON response", async () => {
    mocks.generateContent.mockResolvedValue({ text: '{"ok":true}' });

    await expect(generateJson({ prompt: "hi" })).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects with INVALID_RESPONSE on malformed JSON", async () => {
    mocks.generateContent.mockResolvedValue({ text: "not json" });

    await expect(generateJson({ prompt: "hi" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects with INVALID_INPUT for an oversized prompt", async () => {
    await expect(
      generateJson({ prompt: "x".repeat(MAX_PROMPT_CHARS + 1) })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("isTransientProviderError", () => {
  it("treats HTTP 429 and 5xx statuses as transient", () => {
    expect(isTransientProviderError({ status: 429 })).toBe(true);
    expect(isTransientProviderError({ status: 500 })).toBe(true);
    expect(isTransientProviderError({ status: 503 })).toBe(true);
  });

  it("treats provider RPC overload codes as transient", () => {
    expect(
      isTransientProviderError({ error: { code: "UNAVAILABLE" } })
    ).toBe(true);
    expect(
      isTransientProviderError({ error: { code: "RESOURCE_EXHAUSTED" } })
    ).toBe(true);
  });

  it("treats permanent failures and non-provider values as non-transient", () => {
    expect(isTransientProviderError({ status: 400 })).toBe(false);
    expect(isTransientProviderError({ status: 401 })).toBe(false);
    expect(isTransientProviderError(new Error("boom"))).toBe(false);
    expect(isTransientProviderError(null)).toBe(false);
    expect(isTransientProviderError(undefined)).toBe(false);
  });
});

describe("transient retry", () => {
  beforeEach(() => {
    mocks.generateContent.mockReset();
  });

  it("retries once and succeeds when generateText hits a transient 429", async () => {
    const rateLimited = Object.assign(new Error("rate limited"), {
      status: 429,
    });
    mocks.generateContent
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce({ text: "Hello" });

    await expect(generateText({ prompt: "hi" })).resolves.toBe("Hello");
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent provider failure", async () => {
    const badRequest = Object.assign(new Error("bad request"), { status: 400 });
    mocks.generateContent.mockRejectedValue(badRequest);

    await expect(generateText({ prompt: "hi" })).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });

  it("rejects after retries are exhausted for a persistent transient failure", async () => {
    const rateLimited = Object.assign(new Error("rate limited"), {
      status: 503,
    });
    mocks.generateContent.mockRejectedValue(rateLimited);

    await expect(generateText({ prompt: "hi" })).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    expect(mocks.generateContent).toHaveBeenCalledTimes(
      GENERATION_RETRY_ATTEMPTS
    );
  });

  it("retries once and succeeds when generateJson hits a transient 503", async () => {
    const unavailable = Object.assign(new Error("unavailable"), {
      status: 503,
    });
    mocks.generateContent
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce({ text: '{"ok":true}' });

    await expect(generateJson({ prompt: "hi" })).resolves.toEqual({
      ok: true,
    });
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
  });

  it("does not retry a caller-side timeout", async () => {
    mocks.generateContent.mockReturnValue(new Promise(() => {}));

    await expect(
      generateText({ prompt: "hi", timeoutMs: 5 })
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });
});

describe("searchWebWithGrounding", () => {
  beforeEach(() => {
    mocks.generateContent.mockReset();
  });

  it("returns grounded web results as title and url pairs", async () => {
    mocks.generateContent.mockResolvedValue({
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { title: "Example", uri: "https://example.com" } },
              { web: { uri: "https://no-title.example" } },
              { web: {} },
            ],
          },
        },
      ],
    });

    await expect(searchWebWithGrounding("cats")).resolves.toEqual([
      { title: "Example", url: "https://example.com" },
      { title: "https://no-title.example", url: "https://no-title.example" },
    ]);
  });

  it("returns an empty array when no grounded chunks exist", async () => {
    mocks.generateContent.mockResolvedValue({ candidates: [] });

    await expect(searchWebWithGrounding("cats")).resolves.toEqual([]);
  });
});

describe("toAiError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves the HTTP status and RPC code from a raw provider failure", () => {
    const error = toAiError({
      status: 429,
      error: { code: "RESOURCE_EXHAUSTED", message: "quota" },
    });

    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.status).toBe(429);
    expect(error.rpcCode).toBe("RESOURCE_EXHAUSTED");
  });

  it("reads the RPC code from a raw top-level code field", () => {
    const error = toAiError({ code: "UNAVAILABLE" });

    expect(error.rpcCode).toBe("UNAVAILABLE");
    expect(error.status).toBeUndefined();
  });

  it("leaves markers off when the raw failure carries none", () => {
    const error = toAiError(new Error("boom"));

    expect(error.status).toBeUndefined();
    expect(error.rpcCode).toBeUndefined();
  });

  it("passes an existing AiError through unchanged", () => {
    const error = aiError("NOT_CONFIGURED", "no key");

    expect(toAiError(error)).toBe(error);
  });
});
