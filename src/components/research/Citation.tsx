"use client";

import { useState } from "react";

type CitationProps = {
  index: number;
  sourceName?: string;
  retrievedDate?: string;
  excerpt?: string;
  /** External URL for a web citation; renders the source name as a link. */
  url?: string;
  /** The persisted citation row id; the margin note is keyed by it. */
  targetId?: string;
  onClick?: () => void;
};

const FLASH_DURATION_MS = 1500;

/** Fallback used only if the browser never emits `scrollend` for the scroll. */
const SCROLL_SETTLE_FALLBACK_MS = 400;

let flashTimer: number | undefined;
let settleTimer: number | undefined;
let removeSettleListener: (() => void) | undefined;

/**
 * True when the element is already fully within the viewport, so the smooth
 * scroll is a no-op and the flash can start immediately.
 */
function isFullyVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth
  );
}

function focusCitationTarget(targetId?: string) {
  if (!targetId) return;
  const element = document.getElementById(`citation-${targetId}`);
  if (!element) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  element.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "nearest",
  });

  /**
   * Removes the class, forces a reflow, and adds it back so the animation
   * restarts from its first frame on every click, even if it is still running.
   */
  const startFlash = () => {
    element.classList.remove("citation-flash");
    void element.offsetWidth;
    element.classList.add("citation-flash");

    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      element.classList.remove("citation-flash");
    }, FLASH_DURATION_MS);

    element.focus({ preventScroll: true });
  };

  if (reduceMotion || isFullyVisible(element)) {
    startFlash();
    return;
  }

  // The element is off-screen; a smooth scroll is in flight. Starting the
  // animation now would play it entirely out of view, so the user would see
  // the scroll land with no highlight. Start the flash once the scroll
  // settles, with a timeout fallback in case `scrollend` never fires.
  const settle = () => {
    if (removeSettleListener) {
      removeSettleListener();
      removeSettleListener = undefined;
    }
    window.clearTimeout(settleTimer);
    settleTimer = undefined;
    startFlash();
  };

  if (removeSettleListener) {
    removeSettleListener();
  }
  window.clearTimeout(settleTimer);

  const scrollTargets: EventTarget[] = [
    window,
    document.scrollingElement ?? document.documentElement,
  ];
  removeSettleListener = () => {
    for (const target of scrollTargets) {
      target.removeEventListener("scrollend", settle);
    }
  };
  for (const target of scrollTargets) {
    target.addEventListener("scrollend", settle, { once: true });
  }
  settleTimer = window.setTimeout(settle, SCROLL_SETTLE_FALLBACK_MS);
}

export function Citation({
  index,
  sourceName,
  retrievedDate,
  excerpt,
  url,
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
        className="ml-1 -my-1 -mr-1 inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 font-mono text-[0.7em] leading-none text-ochre"
      >
        {index}
      </button>

      {expanded && sourceName ? (
        <span className="mt-4 block border-t border-rule pt-2 lg:hidden">
          <span className="block font-mono text-xs text-muted">
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
          </span>

          <span className="mt-1 block font-ui text-sm leading-snug text-ink-soft">
            {excerpt}
          </span>
        </span>
      ) : null}
    </>
  );
}
