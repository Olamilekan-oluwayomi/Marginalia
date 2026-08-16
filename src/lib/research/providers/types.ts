/**
 * Contract every answer-generation provider implements.
 *
 * `generate` mirrors the exact call shape the generation layer already uses
 * internally: the compiled prompt, the mode-specific system instruction, the
 * model identifier, the token budget, and the JSON Schema the response must
 * conform to. The provider returns the raw parsed JSON object (an object with
 * `answer` and `citations`); citation validation and resolution happen in the
 * generation layer, unchanged by which provider runs. Providers throw a safe
 * error on configuration or provider failures — they never fabricate a fake
 * success from a failed request.
 */
export type AnswerGenerationInput = {
  /** The user-facing request text (question + numbered research context). */
  prompt: string;
  /** Mode-specific system instruction (document / web / both). */
  system: string;
  /** Model identifier to use for generation. */
  model: string;
  /** Upper bound on generated tokens. */
  maxOutputTokens: number;
  /** JSON Schema the provider must make the response conform to. */
  schema: Record<string, unknown>;
};

export interface AnswerGenerationProvider {
  generate(input: AnswerGenerationInput): Promise<unknown>;
}
