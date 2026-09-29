import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aiError: (code: string, message: string) => ({ code, message }),
  isAiError: (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({
  aiError: mocks.aiError,
  isAiError: mocks.isAiError,
}));

import {
  GroqAnswerProvider,
  DEFAULT_GROQ_MODEL,
} from "@/lib/research/providers/groq";
import type { AnswerGenerationInput } from "@/lib/research/providers/types";

const input: AnswerGenerationInput = {
  prompt: "Research question:\nWhat is the capital of France?",
  system: "You are answering from web search results.",
  model: "test-model",
  maxOutputTokens: 2000,
  schema: { type: "object" },
};

function okJsonResponse(body: unknown): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function jsonResponse(
  body: unknown,
  status: number,
): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: false, status, json: () => Promise.resolve(body) };
}

describe("GroqAnswerProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.GROQ_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
  });

  it("posts the exact generation input and returns the parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "Paris is the capital of France.",
                citations: [],
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GroqAnswerProvider();
    const output = await provider.generate(input);

    expect(output).toEqual({
      answer: "Paris is the capital of France.",
      citations: [],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: DEFAULT_GROQ_MODEL,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
    });
    expect(console.log).toHaveBeenCalledWith(
      `[research] generation:config groqApiKeyConfigured=true model=${DEFAULT_GROQ_MODEL}`,
    );
    expect(console.log).toHaveBeenCalledWith(
      "[research] generation:groq_start",
    );
    expect(console.log).toHaveBeenCalledWith(
      "[research] generation:groq_success",
    );
  });

  it("uses the GROQ_MODEL override when set", async () => {
    process.env.GROQ_MODEL = "qwen/qwen3.6-27b";
    const fetchMock = vi.fn().mockResolvedValue(
      okJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ answer: "x", citations: [] }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GroqAnswerProvider();
    await provider.generate(input);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("qwen/qwen3.6-27b");
    expect(console.log).toHaveBeenCalledWith(
      "[research] generation:config groqApiKeyConfigured=true model=qwen/qwen3.6-27b",
    );
  });

  it("fails with NOT_CONFIGURED when GROQ_API_KEY is missing and never calls the API", async () => {
    delete process.env.GROQ_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GroqAnswerProvider();

    await expect(provider.generate(input)).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      "[research] generation:config groqApiKeyConfigured=false model=openai/gpt-oss-120b",
    );
  });

  it("surfaces a non-2xx response as PROVIDER_ERROR with the redacted message and status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: { message: "rate limited for key test-key" } },
            429,
          ),
        ),
    );

    const provider = new GroqAnswerProvider();

    await expect(provider.generate(input)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      status: 429,
    });
    const errorSpy = vi.mocked(console.error);
    const failureCall = errorSpy.mock.calls.find(
      ([arg]) => arg === "[research] generation:groq_failure error=",
    );
    expect(failureCall).toBeDefined();
    expect(failureCall![1]).toContain("[redacted]");
    expect(failureCall![1]).not.toContain("test-key");
  });

  it("fails with INVALID_RESPONSE when the content is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okJsonResponse({
          choices: [{ message: { content: "not-json" } }],
        }),
      ),
    );

    const provider = new GroqAnswerProvider();

    await expect(provider.generate(input)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("fails with PROVIDER_ERROR when no choices are returned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okJsonResponse({ choices: [] })),
    );

    const provider = new GroqAnswerProvider();

    await expect(provider.generate(input)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "The AI provider returned an empty response.",
    });
  });

  it("times out with a safe provider error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              const error = new Error("The operation was aborted.");
              error.name = "AbortError";
              reject(error);
            });
          }),
      ),
    );

    const provider = new GroqAnswerProvider();
    const promise = provider.generate(input);
    const assertion = expect(promise).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "The AI provider timed out.",
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(console.error).toHaveBeenCalledWith(
      "[research] generation:groq_failure error=The AI provider timed out.",
    );
  });
});
