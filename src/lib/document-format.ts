export function fileTypeFromName(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  if (index <= 0 || index === fileName.length - 1) {
    return "File";
  }
  return fileName.slice(index + 1).toUpperCase();
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
