type MarginNoteProps = {
  sourceName: string;
  retrievedDate?: string;
  excerpt?: string;
  number?: number;
};

export function MarginNote({
  sourceName,
  retrievedDate,
  excerpt,
  number,
}: MarginNoteProps) {
  return (
    <aside className="border-t border-rule pt-2">
      <p className="font-mono text-xs text-muted">
        {number != null ? `[${number}] ` : ""}
        {sourceName}
        {retrievedDate ? ` · ${retrievedDate}` : ""}
      </p>

      {excerpt ? (
        <p className="mt-1 font-ui text-sm leading-snug text-ink-soft">
          {excerpt}
        </p>
      ) : null}
    </aside>
  );
}
