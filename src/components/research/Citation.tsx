"use client";

import { useState } from "react";

type CitationProps = {
  index: number;
  sourceName?: string;
  retrievedDate?: string;
  excerpt?: string;
  /** The persisted citation row id; the margin note is keyed by it. */
  targetId?: string;
  onClick?: () => void;
};

const FLASH_DURATION_MS = 1500;

function focusCitationTarget(targetId?: string) {
  if (!targetId) return;
  const element = document.getElementById(`citation-${targetId}`);
  if (!element) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  element.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "nearest",
  });

  element.classList.remove("citation-flash");
  void element.offsetWidth;
  element.classList.add("citation-flash");
  window.setTimeout(() => {
    element.classList.remove("citation-flash");
  }, FLASH_DURATION_MS);

  element.focus({ preventScroll: true });
}

export function Citation({
  index,
  sourceName,
  retrievedDate,
  excerpt,
  targetId,
  onClick,
}: CitationProps) {
  const [expanded, setExpanded] = useState(false);

  const handleClick = () => {
    setExpanded((prev) => !prev);
    focusCitationTarget(targetId);
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
