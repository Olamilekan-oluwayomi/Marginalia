"use client";

import { useState } from "react";

type CitationProps = {
  index: number;
  sourceName?: string;
  retrievedDate?: string;
  excerpt?: string;
  onClick?: () => void;
};

export function Citation({
  index,
  sourceName,
  retrievedDate,
  excerpt,
  onClick,
}: CitationProps) {
  const [expanded, setExpanded] = useState(false);

  const handleClick = () => {
    setExpanded((prev) => !prev);
    onClick?.();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Citation ${index}${expanded ? ", collapse" : ", expand"}`}
        aria-expanded={expanded}
        className="ml-1 cursor-pointer border-0 bg-transparent p-0 font-mono text-[0.7em] text-ochre"
      >
        {index}
      </button>

      {expanded && sourceName ? (
        <span className="mt-4 block border-t border-rule pt-2 lg:hidden">
          <span className="block font-mono text-xs text-muted">
            {sourceName} · {retrievedDate}
          </span>

          <span className="mt-1 block font-ui text-sm leading-snug text-ink-soft">
            {excerpt}
          </span>
        </span>
      ) : null}
    </>
  );
}
