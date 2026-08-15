import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Supabase } from "@/lib/research/types";

const clientState = vi.hoisted(() => ({
  prompts: [] as string[],
}));

vi.mock("server-only", () => ({}));

// Stub only the provider client: the real `@/lib/ai` module (including its
// `assertPromptBounds` prompt guard) keeps running, so this test proves the
// bounded excerpt summary can never produce a prompt-too-long error.
vi.mock("@/lib/ai/client", () => ({
  getAiClient: () => ({
    models: {
      generateContent: async (input: { contents: string }) => {
        clientState.prompts.push(input.contents);
        return {
          text: JSON.stringify({
            relevant: true,
            confidence: 0.9,
            reason: "The document covers the topic.",
          }),
        };
      },
    },
  }),
}));

vi.mock("@/lib/research/documents", () => ({
  getDocuments: vi.fn(),
}));

import { getDocuments } from "@/lib/research/documents";
import { readyDocumentsSummary } from "@/lib/research/generation";
import { checkDocumentRelevance } from "@/lib/research/relevance-check";

const researchId = "22222222-2222-2222-2222-222222222222";

const fakeSupabase = {} as unknown as Supabase;

function makeReadyDocument(content: string) {
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    research_id: researchId,
    user_id: "33333333-3333-3333-3333-333333333333",
    title: "The study PDF",
    file_name: "study.pdf",
    file_path: "study.pdf",
    mime_type: "application/pdf",
    file_size: content.length,
    status: "ready",
    content,
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
  };
}

describe("relevance check prompt sizing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientState.prompts = [];
  });

  it("does not throw a prompt-too-long error for a test-PDF-sized document (~50k+ chars) via the excerpt summary", async () => {
    const content = "x".repeat(52_000);
    vi.mocked(getDocuments).mockResolvedValue({
      error: null,
      data: [makeReadyDocument(content)],
    });

    const summary = await readyDocumentsSummary(fakeSupabase, researchId);
    expect(summary).not.toBeNull();
    expect(summary!.length).toBe(4_000);
    expect(summary!.length).toBeLessThanOrEqual(12_000);

    await expect(
      checkDocumentRelevance(
        "Is extreme precipitation increasing in the study region?",
        summary!
      )
    ).resolves.toMatchObject({
      relevant: true,
      confidence: 0.9,
    });

    const sentPrompt = clientState.prompts[0];
    expect(sentPrompt).toBeDefined();
    expect(sentPrompt.length).toBeLessThan(40_000);
    expect(sentPrompt).toContain("The study PDF");
    expect(sentPrompt).toContain(
      "Is extreme precipitation increasing in the study region?"
    );
  });
});
