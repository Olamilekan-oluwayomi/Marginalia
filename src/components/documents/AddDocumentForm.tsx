"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import {
  addDocumentAction,
  type AddDocumentState,
} from "@/app/documents/actions";

export type ResearchOption = {
  id: string;
  title: string;
};

const initialState: AddDocumentState = {
  formError: null,
  success: false,
};

function inputClass() {
  return "mt-2 w-full rounded-md border border-rule bg-paper-raised px-4 py-3 font-ui text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-pine";
}

export function AddDocumentForm({
  researchOptions,
}: {
  researchOptions: ResearchOption[];
}) {
  const [state, formAction, pending] = useActionState(
    addDocumentAction,
    initialState
  );

  return (
    <div>
      {researchOptions.length === 0 ? (
        <p className="font-ui text-sm text-muted">
          Create a research workspace first, then you can upload documents into
          it.
        </p>
      ) : (
        <form action={formAction} noValidate>
          <div className="grid max-w-2xl gap-6 sm:grid-cols-2">
            <div>
              <Label htmlFor="document-research">Research</Label>

              <select
                id="document-research"
                name="researchId"
                required
                className={inputClass()}
                defaultValue=""
              >
                <option value="" disabled>
                  Choose a research…
                </option>
                {researchOptions.map((research) => (
                  <option key={research.id} value={research.id}>
                    {research.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="document-file">File</Label>

              <input
                id="document-file"
                name="file"
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                required
                className={inputClass()}
              />
            </div>
          </div>

          {state.formError ? (
            <p role="alert" className="mt-6 font-ui text-sm text-error">
              {state.formError}
            </p>
          ) : null}

          {state.success ? (
            <p className="mt-6 font-ui text-sm text-pine">
              Document uploaded and processed.
            </p>
          ) : null}

          <div className="mt-8">
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Upload document"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
