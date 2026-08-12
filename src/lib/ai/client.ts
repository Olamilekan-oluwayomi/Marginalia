import "server-only";

import { GoogleGenAI } from "@google/genai";

import { aiError } from "./errors";

const API_KEY_ENV = "GEMINI_API_KEY";

let client: GoogleGenAI | null = null;

/**
 * Returns the shared server-side Gemini client, creating it on first use.
 *
 * The API key is read only from `process.env` at call time and is never
 * inlined into client bundles. The client is created lazily so importing this
 * module is always safe; only a call fails (clearly) when the key is missing.
 */
export function getAiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env[API_KEY_ENV];
    if (!apiKey) {
      throw aiError(
        "NOT_CONFIGURED",
        "GEMINI_API_KEY is not set. Add it to .env.local to enable AI features."
      );
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}
