"use client";

/**
 * Root error boundary. A render-time error anywhere in the app is replaced
 * with this lightweight, theme-consistent fallback. Because it sits inside
 * the root layout, the providers (theme, auth, profile) stay mounted, so a
 * failed route render does not blow away the user's session. `retry`
 * re-renders the failed segment. The error is never shown verbatim; only a
 * safe message and digest are logged.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  console.error("App error boundary:", error.message, error.digest);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md rounded-md border border-rule bg-paper-raised p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Something went wrong
        </p>
        <h1 className="mt-3 font-reading text-2xl text-ink">
          This page hit an unexpected error.
        </h1>
        <p className="mt-3 font-ui text-sm text-muted">
          It could not be rendered right now. Try again, and if it keeps
          happening, reload the page.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-6 rounded-md bg-pine px-4 py-2 font-ui text-sm font-medium text-paper transition-colors hover:bg-pine-dim"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
