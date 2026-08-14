"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * When true, the modal cannot be dismissed with Escape or by clicking the
   * backdrop. Used while a destructive action is in flight so it cannot be
   * interrupted mid-deletion.
   */
  preventClose?: boolean;
};

/**
 * Reusable modal built on the native `<dialog>` element so it inherits
 * accessible behavior from the browser: modal focus is trapped inside the
 * dialog, focus returns to the previously focused element on close, and
 * Escape fires the cancel event. Escape and backdrop clicks call `onClose`
 * unless `preventClose` is set.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  preventClose = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) {
      return;
    }

    function handleCancel(event: Event) {
      if (preventClose) {
        event.preventDefault();
      }
    }

    function handleBackdropClick(event: MouseEvent) {
      if (preventClose) {
        return;
      }
      if (event.target === dialog) {
        onClose();
      }
    }

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [open, preventClose, onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-md border border-rule bg-paper-raised p-6 text-ink shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop:bg-black/40"
      onClose={onClose}
    >
      <h2
        id={titleId}
        className="font-reading text-xl leading-snug text-ink"
      >
        {title}
      </h2>

      <div className="mt-4">{children}</div>
    </dialog>
  );
}
