type MarginNoteProps = {
  sourceName: string;
  retrievedDate: string;
  excerpt: string;
};

export function MarginNote({
  sourceName,
  retrievedDate,
  excerpt,
}: MarginNoteProps) {
  return (
    <aside className="border-t border-rule pt-2">
      <p className="font-mono text-xs text-muted">
        {sourceName} · {retrievedDate}
      </p>

      <p className="mt-1 font-ui text-sm leading-snug text-ink-soft">
        {excerpt}
      </p>
    </aside>
  );
}
