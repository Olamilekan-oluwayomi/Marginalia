"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import {
  askQuestionAction,
  type AskQuestionState,
} from "@/app/research/[id]/actions";

const QUESTION_FIELD_ID = "research-question";

const initialState: AskQuestionState = {
  fieldErrors: {},
  formError: null,
  success: false,
};

export function QuestionComposer({ researchId }: { researchId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [state, formAction, pending] = useActionState(
    askQuestionAction.bind(null, researchId),
    initialState
  );

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      textareaRef.current?.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} noValidate>
      <Label htmlFor={QUESTION_FIELD_ID}>Ask another question</Label>

      <Textarea
        ref={textareaRef}
        id={QUESTION_FIELD_ID}
        name="question"
        className="mt-3 min-h-28"
        placeholder="Ask something about your research..."
        maxLength={1000}
        aria-invalid={Boolean(state.fieldErrors.question)}
        aria-describedby={
          state.fieldErrors.question
            ? `${QUESTION_FIELD_ID}-error`
            : undefined
        }
      />

      {state.fieldErrors.question ? (
        <p
          id={`${QUESTION_FIELD_ID}-error`}
          className="mt-2 font-ui text-xs text-error"
        >
          {state.fieldErrors.question}
        </p>
      ) : null}

      {state.formError ? (
        <p role="alert" className="mt-3 font-ui text-sm text-error">
          {state.formError}
        </p>
      ) : null}

      <label className="mt-4 flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          name="includeWeb"
          className="size-4 accent-pine"
        />
        Search the web for sources before answering
      </label>

      <div className="mt-3 flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Asking..." : "Ask question"}
        </Button>
      </div>
    </form>
  );
}
