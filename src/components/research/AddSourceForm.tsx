"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { TextInput } from "@/components/ui/TextInput";
import {
  addSourceAction,
  type AddSourceState,
} from "@/app/research/[id]/actions";

const TITLE_FIELD_ID = "source-title";
const URL_FIELD_ID = "source-url";
const PUBLISHER_FIELD_ID = "source-publisher";
const RETRIEVED_FIELD_ID = "source-retrieved-at";
const CONTENT_FIELD_ID = "source-content";

const initialState: AddSourceState = {
  fieldErrors: {},
  formError: null,
  success: false,
};

export function AddSourceForm({ researchId }: { researchId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(
    addSourceAction.bind(null, researchId),
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      titleRef.current?.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} noValidate>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label
            htmlFor={TITLE_FIELD_ID}
            className="font-ui text-sm font-medium text-ink"
          >
            Title
          </label>

          <TextInput
            ref={titleRef}
            id={TITLE_FIELD_ID}
            name="title"
            type="text"
            maxLength={300}
            required
            placeholder="e.g. A systematic review of wetland loss"
            error={state.fieldErrors.title}
          />
        </div>

        <div>
          <Label htmlFor={URL_FIELD_ID}>URL (optional)</Label>

          <TextInput
            id={URL_FIELD_ID}
            name="url"
            type="url"
            maxLength={500}
            placeholder="https://…"
            error={state.fieldErrors.url}
          />
        </div>

        <div>
          <Label htmlFor={PUBLISHER_FIELD_ID}>Publisher (optional)</Label>

          <TextInput
            id={PUBLISHER_FIELD_ID}
            name="publisher"
            type="text"
            maxLength={200}
            placeholder="e.g. Journal of Hydrology"
            error={state.fieldErrors.publisher}
          />
        </div>

        <div>
          <Label htmlFor={RETRIEVED_FIELD_ID}>Retrieved (optional)</Label>

          <TextInput
            id={RETRIEVED_FIELD_ID}
            name="retrievedAt"
            type="date"
            error={state.fieldErrors.retrievedAt}
          />
        </div>
      </div>

      <div className="mt-6">
        <Label htmlFor={CONTENT_FIELD_ID}>Body text (optional)</Label>

        <Textarea
          id={CONTENT_FIELD_ID}
          name="content"
          className="mt-2 min-h-40"
          maxLength={200000}
          placeholder="Paste the article or page text so it can be cited in generated answers."
          aria-invalid={Boolean(state.fieldErrors.content)}
          aria-describedby={
            state.fieldErrors.content ? `${CONTENT_FIELD_ID}-error` : undefined
          }
        />

        {state.fieldErrors.content ? (
          <p
            id={`${CONTENT_FIELD_ID}-error`}
            className="mt-2 font-ui text-xs text-error"
          >
            {state.fieldErrors.content}
          </p>
        ) : null}
      </div>

      {state.formError ? (
        <p role="alert" className="mt-6 font-ui text-sm text-error">
          {state.formError}
        </p>
      ) : null}

      {state.success ? (
        <p role="status" className="mt-6 font-ui text-sm text-pine">
          Source added.
        </p>
      ) : null}

      <div className="mt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add source"}
        </Button>
      </div>
    </form>
  );
}
