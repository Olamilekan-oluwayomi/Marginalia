import "server-only";

import { generateJson, isAiError } from "@/lib/ai";
import type {
  AnswerGenerationInput,
  AnswerGenerationProvider,
} from "./types";

/**
 * Gemini-backed answer generation provider.
 *
 * Wraps the exact existing call the generation layer makes: `generateJson`
 * with the same prompt, system instruction, model, token budget, and JSON
 * Schema, so prompts (document / web / both modes), the response format, and
 * error handling stay identical. Retry, timeout, and error normalization are
 * owned by the AI layer inside `generateJson`, so provider failures surface
 * to callers exactly as before. Citation parsing stays in the generation
 * layer, which validates the returned object against the citation protocol.
 */
export class GeminiAnswerProvider implements AnswerGenerationProvider {
  async generate(input: AnswerGenerationInput): Promise<unknown> {
    console.log("[research] generation:gemini_start");
    try {
      const raw = await generateJson(input);
      console.log("[research] generation:gemini_success");
      return raw;
    } catch (error) {
      // Log only the preserved status (or "unknown"), never the raw error
      // which may embed request content or the API key.
      const status =
        isAiError(error) && error.status !== undefined
          ? String(error.status)
          : "unknown";
      console.error(`[research] generation:gemini_failure status=${status}`);
      throw error;
    }
  }
}
