"use client";

import { useEffect, useRef } from "react";
import { useActionState, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/input-class";
import { Label } from "@/components/ui/Label";
import { TextInput } from "@/components/ui/TextInput";
import {
  addDocumentAction,
  type AddDocumentState,
} from "@/app/documents/actions";
import {
  isPdfFileName,
  isPdfMime,
  MAX_UPLOAD_BYTES,
} from "@/lib/research/document-upload";

export type ResearchOption = {
  id: string;
  title: string;
};

const initialState: AddDocumentState = {
  formError: null,
  success: false,
};

const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

function validateFile(file: File | null): string | null {
  if (!file) {
    return "Choose a PDF file to upload.";
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `PDF files must be ${MAX_UPLOAD_MB} MB or smaller.`;
  }
  if (!isPdfFileName(file.name)) {
    return "Only PDF files can be uploaded.";
  }
  if (!isPdfMime(file.type)) {
    return "That file isn't a PDF.";
  }
  return null;
}

export function AddDocumentForm({
  researchOptions,
}: {
  researchOptions: ResearchOption[];
}) {
  const [state, formAction, pending] = useActionState(
    addDocumentAction,
    initialState,
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem(
      "file",
    ) as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    const error = validateFile(file);
    setClientError(error);
    if (error) {
      event.preventDefault();
    }
  }

  return (
    <div>
      {researchOptions.length === 0 ? (
        <p className="font-ui text-sm text-muted">
          Create a research workspace first, then you can upload documents into
          it.
        </p>
      ) : (
        <form
          ref={formRef}
          action={formAction}
          onSubmit={handleSubmit}
          noValidate
        >
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

              <TextInput
                id="document-file"
                name="file"
                type="file"
                accept=".pdf,application/pdf"
                required
              />

              <p className="mt-2 font-ui text-xs text-muted">
                PDF files up to {MAX_UPLOAD_MB} MB.
              </p>
            </div>
          </div>

          {(clientError ?? state.formError) ? (
            <p role="alert" className="mt-6 font-ui text-sm text-error">
              {clientError ?? state.formError}
            </p>
          ) : null}

          {state.success ? (
            <p role="status" className="mt-6 font-ui text-sm text-pine">
              Document uploaded and processed.
            </p>
          ) : null}

          <div className="mt-8">
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Upload PDF"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
