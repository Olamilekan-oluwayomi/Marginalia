/**
 * Setup for the `dom` Vitest project (every `*.test.tsx`).
 *
 * `jest-dom/vitest` registers the DOM matchers (`toBeInTheDocument`,
 * `toHaveAccessibleName`, …) on Vitest's `expect`. `cleanup` unmounts every
 * rendered tree after each test, which Vitest does not do for us because
 * globals are not enabled.
 *
 * The stubs below fill the two platform APIs jsdom leaves out that the
 * component layer calls directly. They live here so individual suites do not
 * each have to rediscover the gaps.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/** jsdom has no layout engine, so scrolling is a no-op stub. */
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

/** jsdom has no `matchMedia`; default to "no reduced-motion preference". */
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(() => {
  cleanup();
});
