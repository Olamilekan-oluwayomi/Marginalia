"use client";

import { useActionState, useState } from "react";
import type { FormEvent } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  deleteDocumentAction,
  retryDocumentAction,
  type DeleteDocumentState,
  type RetryDocumentState,
} from "@/app/documents/actions";
import type { DocumentStatus } from "@/lib/research/types";

const deleteInitialState: DeleteDocumentState = { error: null };
const retryInitialState: RetryDocumentState = { error: null, success: false };

function actionButtonClass(
  tone: "default" | "danger",
  pending: boolean,
): string {
  const base =
    "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-2 font-ui text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
  if (tone === "danger") {
    return `${base} border-error/40 text-error hover:bg-error/5 ${
      pending ? "" : "active:bg-error/10"
    }`;
  }
  return `${base} border-rule bg-paper-raised text-ink hover:border-pine ${
    pending ? "" : "active:bg-paper"
  }`;
}

/**
 * Per-document actions shown in the documents library and the research
 * workspace: a Retry control when processing failed, and a Delete control
 * that opens a confirmation modal before removing the document and its
 * private source file. Both are thin forms that submit the shared server
 * actions.
 */
export function DocumentActions({
  documentId,
  title,
  status,
}: {
  documentId: string;
  title: string;
  status: DocumentStatus;
}) {
  const [retryState, retryFormAction, retryPending] = useActionState(
    retryDocumentAction,
    retryInitialState,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteState, setDeleteState] = useState(deleteInitialState);
  const [deletePending, setDeletePending] = useState(false);

  async function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deletePending) {
      return;
    }
    setDeletePending(true);
    setDeleteState(deleteInitialState);
    const formData = new FormData(event.currentTarget);
    const result = await deleteDocumentAction(deleteInitialState, formData);
    setDeleteState(result);
    setDeletePending(false);
    if (result.error === null) {
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {status === "failed" ? (
            <form action={retryFormAction}>
              <input type="hidden" name="documentId" value={documentId} />
              <button
                type="submit"
                disabled={retryPending}
                className={actionButtonClass("default", retryPending)}
              >
                <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
                {retryPending ? "Retrying…" : "Retry"}
              </button>
            </form>
          ) : null}

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label={`Delete ${title}`}
            className={actionButtonClass("danger", false)}
          >
            <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
            {/* Icon-only below sm so the action stays compact on narrow
                screens; the label returns from sm up. The aria-label keeps
                the control named either way. */}
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>

        {retryState.error ? (
          <p role="alert" className="max-w-56 font-ui text-xs text-error">
            {retryState.error}
          </p>
        ) : null}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete document?"
        preventClose={deletePending}
      >
        <p className="font-ui text-sm text-ink">
          Are you sure you want to delete &ldquo;{title}&rdquo;? This will
          permanently remove the document and its uploaded file. This action
          cannot be undone.
        </p>

        <form onSubmit={handleDeleteSubmit} noValidate>
          <input type="hidden" name="documentId" value={documentId} />

          {deleteState.error ? (
            <p role="alert" className="mt-4 font-ui text-sm text-error">
              {deleteState.error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={deletePending}
              className="rounded-md border border-rule bg-paper-raised px-4 py-2 font-ui text-sm font-medium text-ink transition-colors hover:border-pine active:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={deletePending}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-error bg-error px-4 py-2 font-ui text-sm font-medium text-paper transition-colors hover:bg-error/90 active:bg-error/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
              {deletePending ? "Deleting…" : "Delete document"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
