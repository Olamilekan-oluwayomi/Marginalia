export function fileTypeFromName(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  if (index <= 0 || index === fileName.length - 1) {
    return "File";
  }
  return fileName.slice(index + 1).toUpperCase();
}

/** Human-readable file size, or an empty string when no size is recorded. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function documentStatusLabel(status: string): string {
  if (status === "ready") return "Ready";
  if (status === "processing") return "Processing";
  if (status === "failed") return "Failed";
  return "Pending";
}

export function documentStatusClass(status: string): string {
  if (status === "ready") return "text-pine";
  if (status === "failed") return "text-error";
  return "text-muted";
}
