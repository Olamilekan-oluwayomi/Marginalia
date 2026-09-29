"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import {
  retryAnswerAction,
  type RetryAnswerState,
} from "@/app/research/[id]/actions";

const initialState: RetryAnswerState = { formError: null };

export function RetryAnswer({
  researchId,
  questionId,
}: {
  researchId: string;
  questionId: string;
}) {
  const [state, formAction, pending] = useActionState(
    retryAnswerAction.bind(null, researchId),
    initialState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="questionId" value={questionId} />

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Retrying..." : "Retry"}
      </Button>

      {state.formError ? (
        <p role="alert" className="mt-2 font-ui text-xs text-error">
          {state.formError}
        </p>
      ) : null}
    </form>
  );
}
