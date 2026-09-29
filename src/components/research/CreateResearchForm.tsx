"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import {
  createResearchAction,
  type CreateResearchState,
} from "@/app/research/new/actions";

const TITLE_FIELD_ID = "research-title";
const DESCRIPTION_FIELD_ID = "research-description";

const initialState: CreateResearchState = {
  fieldErrors: {},
  formError: null,
};

export function CreateResearchForm() {
  const [state, formAction, pending] = useActionState(
    createResearchAction,
    initialState,
  );

  return (
    <form action={formAction} noValidate>
      <div className="grid gap-6">
        <div>
          <label
            htmlFor={TITLE_FIELD_ID}
            className="font-ui text-sm font-medium text-ink"
          >
            Title
          </label>

          <TextInput
            id={TITLE_FIELD_ID}
            name="title"
            type="text"
            maxLength={200}
            required
            autoFocus
            placeholder="e.g. Rainfall variability and seasonal onset"
            error={state.fieldErrors.title}
          />
        </div>

        <div>
          <Label htmlFor={DESCRIPTION_FIELD_ID}>Description</Label>

          <Textarea
            id={DESCRIPTION_FIELD_ID}
            name="description"
            className="mt-2 min-h-28"
            placeholder="Optional — what question are you trying to answer?"
            aria-invalid={Boolean(state.fieldErrors.description)}
            aria-describedby={
              state.fieldErrors.description
                ? `${DESCRIPTION_FIELD_ID}-error`
                : undefined
            }
          />

          {state.fieldErrors.description ? (
            <p
              id={`${DESCRIPTION_FIELD_ID}-error`}
              className="mt-2 font-ui text-xs text-error"
            >
              {state.fieldErrors.description}
            </p>
          ) : null}
        </div>
      </div>

      {state.formError ? (
        <p role="alert" className="mt-6 font-ui text-sm text-error">
          {state.formError}
        </p>
      ) : null}

      <div className="mt-8 flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create research"}
        </Button>

        <Button variant="secondary" href="/research">
          Cancel
        </Button>
      </div>
    </form>
  );
}
