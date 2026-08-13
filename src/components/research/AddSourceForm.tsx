"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
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

function inputClass(invalid: boolean) {
  return `mt-2 w-full rounded-md border bg-paper-raised px-4 py-3 font-ui text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-pine ${
    invalid ? "border-error" : "border-rule"
  }`;
}

export function AddSourceForm({ researchId }: { researchId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(
    addSourceAction.bind(null, researchId),
    initialState
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

          <input
            ref={titleRef}
            id={TITLE_FIELD_ID}
            name="title"
            type="text"
            maxLength={300}
            required
            placeholder="e.g. A systematic review of wetland loss"
            aria-invalid={Boolean(state.fieldErrors.title)}
            aria-describedby={
              state.fieldErrors.title ? `${TITLE_FIELD_ID}-error` : undefined
            }
            className={inputClass(Boolean(state.fieldErrors.title))}
          />

          {state.fieldErrors.title ? (
            <p
              id={`${TITLE_FIELD_ID}-error`}
              className="mt-2 font-ui text-xs text-error"
            >
              {state.fieldErrors.title}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor={URL_FIELD_ID}>URL (optional)</Label>

          <input
            id={URL_FIELD_ID}
            name="url"
            type="url"
            maxLength={500}
            placeholder="https://…"
            aria-invalid={Boolean(state.fieldErrors.url)}
            aria-describedby={
              state.fieldErrors.url ? `${URL_FIELD_ID}-error` : undefined
            }
            className={inputClass(Boolean(state.fieldErrors.url))}
          />

          {state.fieldErrors.url ? (
            <p
              id={`${URL_FIELD_ID}-error`}
              className="mt-2 font-ui text-xs text-error"
            >
              {state.fieldErrors.url}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor={PUBLISHER_FIELD_ID}>Publisher (optional)</Label>

          <input
            id={PUBLISHER_FIELD_ID}
            name="publisher"
            type="text"
            maxLength={200}
            placeholder="e.g. Journal of Hydrology"
            aria-invalid={Boolean(state.fieldErrors.publisher)}
            aria-describedby={
              state.fieldErrors.publisher
                ? `${PUBLISHER_FIELD_ID}-error`
                : undefined
            }
            className={inputClass(Boolean(state.fieldErrors.publisher))}
          />

          {state.fieldErrors.publisher ? (
            <p
              id={`${PUBLISHER_FIELD_ID}-error`}
              className="mt-2 font-ui text-xs text-error"
            >
              {state.fieldErrors.publisher}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor={RETRIEVED_FIELD_ID}>Retrieved (optional)</Label>

          <input
            id={RETRIEVED_FIELD_ID}
            name="retrievedAt"
            type="date"
            aria-invalid={Boolean(state.fieldErrors.retrievedAt)}
            aria-describedby={
              state.fieldErrors.retrievedAt
                ? `${RETRIEVED_FIELD_ID}-error`
                : undefined
            }
            className={inputClass(Boolean(state.fieldErrors.retrievedAt))}
          />

          {state.fieldErrors.retrievedAt ? (
            <p
              id={`${RETRIEVED_FIELD_ID}-error`}
              className="mt-2 font-ui text-xs text-error"
            >
              {state.fieldErrors.retrievedAt}
            </p>
          ) : null}
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
        <p className="mt-6 font-ui text-sm text-pine">Source added.</p>
      ) : null}

      <div className="mt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add source"}
        </Button>
      </div>
    </form>
  );
}
