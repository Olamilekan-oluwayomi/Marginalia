import type { AnswerStatus } from "@/lib/research";

const STATUS_LABELS: Record<AnswerStatus, string> = {
  pending: "Waiting to start",
  generating: "Generating",
  complete: "Complete",
  failed: "Failed",
};

const STATUS_CLASSES: Record<AnswerStatus, string> = {
  pending: "text-muted",
  generating: "text-ochre",
  complete: "text-pine",
  failed: "text-error",
};

/**
 * Small status badge for a research question's answer. `aria-live` is left to
 * the surrounding status region; this is a pure label.
 */
export function QuestionStatusBadge({
  status,
}: {
  status: AnswerStatus;
}) {
  return (
    <span
      className={`font-mono text-xs ${STATUS_CLASSES[status] ?? "text-muted"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
