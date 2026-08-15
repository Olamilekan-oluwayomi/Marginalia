export type AppErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "DATABASE_ERROR";

export type AppError = {
  code: AppErrorCode;
  message: string;
};

/**
 * Result shape returned by every data-layer operation.
 *
 * Lists return `data` as `T[]`, single items and mutations return `data` as
 * `T | null`. Errors are always one of the four `AppErrorCode` values and
 * never leak raw Postgres/Supabase details.
 */
export type AppResult<T> = {
  data: T;
  error: AppError | null;
};

export function ok<T>(data: T): AppResult<T> {
  return { data, error: null };
}

export function fail<T>(error: AppError, data: T): AppResult<T> {
  return { data, error };
}

export function appError(code: AppErrorCode, message: string): AppError {
  return { code, message };
}

export function unauthorized(
  message = "You must be signed in to do that."
): AppError {
  return appError("UNAUTHORIZED", message);
}

export function notFound(
  message = "The requested item was not found."
): AppError {
  return appError("NOT_FOUND", message);
}

export function validationError(message: string): AppError {
  return appError("VALIDATION_ERROR", message);
}

export function databaseError(
  message = "Unable to access your data right now. Please try again."
): AppError {
  return appError("DATABASE_ERROR", message);
}

const APP_ERROR_CODES: readonly AppErrorCode[] = [
  "UNAUTHORIZED",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "DATABASE_ERROR",
];

export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as AppError).message === "string" &&
    (APP_ERROR_CODES as readonly string[]).includes((error as AppError).code)
  );
}

/**
 * Extracts a single-line, sanitized log message from an unknown value. Raw
 * Supabase/Postgrest error objects can embed row data or connection details in
 * fields like `details` and `hint`, so only the message is logged — never the
 * object itself.
 */
function toLogMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Unknown database error.";
}

/**
 * Formats an unknown thrown value for developer logs: message and stack when
 * it is an Error, otherwise the serialized value. Plain objects serialize to
 * JSON so they never log as a useless "[object Object]"; a value that cannot
 * be serialized degrades to its string form.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack ?? "(no stack)"}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Normalizes an unknown failure (Supabase/Postgrest errors, thrown values)
 * into a safe `AppError`. Only the sanitized error message is logged; raw
 * database details are never surfaced to UI callers.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  console.error("[research-data] database error:", toLogMessage(error));
  return databaseError();
}
