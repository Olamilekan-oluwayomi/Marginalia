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

export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as AppError).message === "string"
  );
}

/**
 * Normalizes an unknown failure (Supabase/Postgrest errors, thrown values)
 * into a safe `AppError`. Raw database details are logged for developers but
 * never surfaced to UI callers.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  console.error("[research-data] database error:", error);
  return databaseError();
}
