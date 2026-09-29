import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  isAiError: (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({
  generateJson: mocks.generateJson,
  isAiError: mocks.isAiError,
}));

import { GeminiAnswerProvider } from "@/lib/research/providers/gemini";
import type { AnswerGenerationInput } from "@/lib/research/providers/types";

const input: AnswerGenerationInput = {
  prompt: "Research question:\nWhat is the capital of France?",
  system: "You are answering from web search results.",
  model: "test-model",
  maxOutputTokens: 2000,
  schema: { type: "object" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.generateJson.mockResolvedValue({
    answer: "Paris is the capital of France.",
    citations: [],
  });
});

describe("GeminiAnswerProvider", () => {
  it("forwards the exact generation input to generateJson", async () => {
    const provider = new GeminiAnswerProvider();
    const output = await provider.generate(input);

    expect(mocks.generateJson).toHaveBeenCalledOnce();
    expect(mocks.generateJson).toHaveBeenCalledWith(input);
    expect(output).toEqual({
      answer: "Paris is the capital of France.",
      citations: [],
    });
    expect(console.log).toHaveBeenCalledWith(
      "[research] generation:gemini_start",
    );
    expect(console.log).toHaveBeenCalledWith(
      "[research] generation:gemini_success",
    );
  });

  it("propagates provider failures unchanged and logs the preserved status", async () => {
    const failure = {
      code: "PROVIDER_ERROR",
      message: "rate limited",
      status: 429,
    };
    mocks.generateJson.mockRejectedValue(failure);
    const provider = new GeminiAnswerProvider();

    await expect(provider.generate(input)).rejects.toMatchObject(failure);
    expect(console.error).toHaveBeenCalledWith(
      "[research] generation:gemini_failure status=429",
    );
  });

  it("logs status=unknown when the failure carries no status", async () => {
    mocks.generateJson.mockRejectedValue(new Error("boom"));
    const provider = new GeminiAnswerProvider();

    await expect(provider.generate(input)).rejects.toThrow("boom");
    expect(console.error).toHaveBeenCalledWith(
      "[research] generation:gemini_failure status=unknown",
    );
  });
});
