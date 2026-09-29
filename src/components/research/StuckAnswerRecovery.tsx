"use client";

import { useActionState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import {
  recoverStuckAnswerAction,
  type RecoverAnswerState,
} from "@/app/research/[id]/actions";

const initialState: RecoverAnswerState = { formError: null };

/**
 * How long a question may stay in `pending`/`generating` before it is treated
 * as stuck. Generation runs after the response is sent (see
 * `runAfterResponse`); a wait far longer than a healthy run means the
 * background task that owned the status transition died.
 */
const STALE_ANSWER_MS = 5 * 60 * 1000;

/** How often the staleness check re-runs after the component mounts. */
const CLOCK_TICK_MS = 30_000;

function subscribeToClock(onStoreChange: () => void): () => void {
  const id = window.setInterval(onStoreChange, CLOCK_TICK_MS);
  return () => window.clearInterval(id);
}

/**
 * Appears only once the server-side waiting state has lasted longer than
 * `STALE_ANSWER_MS`; before that it renders nothing. Resetting moves the
 * question back to `failed`, from which the normal Retry control can
 * regenerate it. The clock is read through `useSyncExternalStore` because
 * `Date.now()` is not allowed during render.
 */
export function StuckAnswerRecovery({
  researchId,
  questionId,
  createdAt,
}: {
  researchId: string;
  questionId: string;
  createdAt: string;
}) {
  const [state, formAction, pending] = useActionState(
    recoverStuckAnswerAction.bind(null, researchId),
    initialState,
  );

  const staleAt = new Date(createdAt).getTime() + STALE_ANSWER_MS;
  const isStale = useSyncExternalStore(
    subscribeToClock,
    () => Date.now() >= staleAt,
    () => false,
  );

  if (!isStale) {
    return null;
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="questionId" value={questionId} />

      <p className="font-ui text-xs text-muted">
        This question looks stuck. Reset it to retry.
      </p>

      <div className="mt-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Resetting…" : "Reset question"}
        </Button>
      </div>

      {state.formError ? (
        <p role="alert" className="mt-2 font-ui text-xs text-error">
          {state.formError}
        </p>
      ) : null}
    </form>
  );
}
