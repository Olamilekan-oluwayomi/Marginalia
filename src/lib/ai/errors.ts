export type AiErrorCode = "NOT_CONFIGURED" | "PROVIDER_ERROR";

export type AiError = {
  code: AiErrorCode;
  message: string;
};

export function aiError(code: AiErrorCode, message: string): AiError {
  return { code, message };
}

export function isAiError(error: unknown): error is AiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as AiError).message === "string"
  );
}

function toLogMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Normalizes an unknown provider failure into a safe `AiError`. Raw SDK
 * details are logged for developers (message only, never request objects or
 * headers) but never surfaced to UI callers.
 */
export function toAiError(error: unknown): AiError {
  if (isAiError(error)) {
    return error;
  }

  console.error("[ai] provider error:", toLogMessage(error));
  return aiError(
    "PROVIDER_ERROR",
    "The AI provider could not complete the request."
  );
}
