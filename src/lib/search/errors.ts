export type SearchErrorCode = "NOT_CONFIGURED" | "PROVIDER_ERROR";

export type SearchError = {
  code: SearchErrorCode;
  message: string;
};

export function searchError(code: SearchErrorCode, message: string): SearchError {
  return { code, message };
}

export function isSearchError(error: unknown): error is SearchError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as SearchError).message === "string"
  );
}
