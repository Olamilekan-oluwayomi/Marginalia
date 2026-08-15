type MarginNoteProps = {
  sourceName: string;
  retrievedDate?: string;
  excerpt?: string;
  number?: number;
  /** External URL for a web citation; renders the source name as a link. */
  url?: string;
};

export function MarginNote({
  sourceName,
  retrievedDate,
  excerpt,
  number,
  url,
}: MarginNoteProps) {
  return (
    <aside className="border-t border-rule pt-2">
      <p className="font-mono text-xs text-muted">
        {number != null ? `[${number}] ` : ""}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words text-pine underline decoration-pine/40 underline-offset-2 hover:text-pine-dim"
          >
            {sourceName}
          </a>
        ) : (
          sourceName
        )}
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
