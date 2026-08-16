export type AiErrorCode =
  | "NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE"
  | "INVALID_INPUT";

export type AiError = {
  code: AiErrorCode;
  message: string;
  /**
   * Preserved HTTP status when the raw provider failure carried one (e.g.
   * 429). Lets downstream fallback decisions classify quota/overload errors
   * after normalization.
   */
  status?: number;
  /**
   * Preserved provider RPC code when the raw failure carried one (e.g.
   * RESOURCE_EXHAUSTED).
   */
  rpcCode?: string;
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
 * headers) and preserved on the returned error's message so downstream layers
 * (search error mapping, answer-generation logging) can distinguish a quota,
 * auth, timeout, or grounding failure instead of reducing every cause to the
 * same generic line. The message is never surfaced to UI callers.
 */
export function toAiError(error: unknown): AiError {
  if (isAiError(error)) {
    return error;
  }

  const detail = toLogMessage(error);
  console.error("[ai] provider error:", detail);

  const candidate = error as {
    status?: unknown;
    error?: { code?: unknown };
    code?: unknown;
  };
  const status =
    typeof candidate.status === "number" ? candidate.status : undefined;
  const rpcCode =
    (typeof candidate.error === "object" &&
      candidate.error !== null &&
      typeof candidate.error.code === "string"
      ? candidate.error.code
      : undefined) ??
    (typeof candidate.code === "string" ? candidate.code : undefined);

  return {
    code: "PROVIDER_ERROR",
    message: `The AI provider could not complete the request: ${detail}`,
    ...(status !== undefined ? { status } : {}),
    ...(rpcCode !== undefined ? { rpcCode } : {}),
  };
}
