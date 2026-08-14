"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  deleteSourceAction,
  type DeleteSourceState,
} from "@/app/research/[id]/actions";

const deleteInitialState: DeleteSourceState = { error: null };

/**
 * Per-source action shown in the research workspace: a Delete control that
 * opens a confirmation modal before removing the source row. Thin form that
 * submits the shared server action.
 */
export function SourceActions({
  sourceId,
  title,
}: {
  sourceId: string;
  title: string;
}) {
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
    const result = await deleteSourceAction(deleteInitialState, formData);
    setDeleteState(result);
    setDeletePending(false);
    if (result.error === null) {
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        aria-label={`Delete ${title}`}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-error/40 px-3 py-2 font-ui text-xs font-medium text-error transition-colors hover:bg-error/5 active:bg-error/10"
      >
        <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
        Delete
      </button>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete source?"
        preventClose={deletePending}
      >
        <p className="font-ui text-sm text-ink">
          Are you sure you want to delete &ldquo;{title}&rdquo;? Any citations
          in answers that reference it will lose their source. This action
          cannot be undone.
        </p>

        <form onSubmit={handleDeleteSubmit} noValidate>
          <input type="hidden" name="sourceId" value={sourceId} />

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
              {deletePending ? "Deleting…" : "Delete source"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
