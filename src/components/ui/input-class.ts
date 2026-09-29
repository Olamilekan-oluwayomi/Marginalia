/** Shared visual treatment for single-line form inputs. */
export function inputClass(invalid = false, readOnly = false): string {
  return `mt-2 w-full rounded-md border bg-paper-raised px-4 py-3 font-ui text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-pine ${
    invalid ? "border-error" : "border-rule"
  }${readOnly ? " cursor-default opacity-70" : ""}`;
}
