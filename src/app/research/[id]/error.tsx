"use client";

/**
 * Research workspace error boundary. Catches render-time errors on the
 * workspace page (the most data-heavy route in the app) so the user sees a
 * contained fallback with a retry rather than the default error page. The
 * error is never shown verbatim; only a safe message and digest are logged.
 */
export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  console.error("Workspace error boundary:", error.message, error.digest);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="rounded-md border border-rule bg-paper-raised p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Something went wrong
        </p>
        <h1 className="mt-3 font-reading text-2xl text-ink">
          This research could not be shown right now.
        </h1>
        <p className="mt-3 font-ui text-sm text-muted">
          An unexpected error happened while loading it. Try again, and if it
          keeps happening, reload the page.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-6 rounded-md bg-pine px-4 py-2 font-ui text-sm font-medium text-paper transition-colors hover:bg-pine-dim"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
