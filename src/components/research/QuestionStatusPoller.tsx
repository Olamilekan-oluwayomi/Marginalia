"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** How often the page refreshes while any question is waiting on generation. */
const POLL_INTERVAL_MS = 2000;

/**
 * Refreshes the workspace route on an interval while any question is in
 * `pending` or `generating`.
 *
 * Generation runs after the response (see `runAfterResponse`), so the
 * server-action request itself returns immediately. This component re-fetches
 * the server-rendered page until a terminal state (`complete`/`failed`)
 * appears; the page then renders the answer or the retry control and polling
 * stops. If a run dies mid-task, the page keeps showing the waiting state and
 * the existing stale-state recovery control takes over.
 */
export function QuestionStatusPoller({ isWaiting }: { isWaiting: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!isWaiting) {
      return;
    }

    const id = window.setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [isWaiting, router]);

  return null;
}
