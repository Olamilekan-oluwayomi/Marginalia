import type { DocumentStatus } from "@/lib/research/types";

const STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_CLASSES: Record<DocumentStatus, string> = {
  pending: "text-muted",
  processing: "text-muted",
  ready: "text-pine",
  failed: "text-error",
};

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

/** Takes a validated `DocumentStatus` — narrow the raw column first. */
export function documentStatusLabel(status: DocumentStatus): string {
  return STATUS_LABELS[status];
}

/** Takes a validated `DocumentStatus` — narrow the raw column first. */
export function documentStatusClass(status: DocumentStatus): string {
  return STATUS_CLASSES[status];
}
