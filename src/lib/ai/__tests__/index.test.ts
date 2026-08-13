import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MODEL,
  MAX_PROMPT_CHARS,
  MAX_SYSTEM_CHARS,
  generateJson,
  generateText,
  searchWebWithGrounding,
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
