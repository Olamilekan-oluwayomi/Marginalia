import Link from "next/link";

/**
 * Global not-found page. Rendered when a route calls `notFound()` (e.g. a
 * research workspace id that does not exist) or no route matches. Styled like
 * the other auth/standalone pages and fully static — no data access, so it can
 * never leak private content.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-paper px-6 py-12 text-ink sm:py-16">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <p className="font-ui text-sm font-medium text-ink">Marginalia</p>
        <p className="mt-0.5 font-ui text-xs text-muted">
          Research, read, connect.
        </p>

        <div className="mt-10 rounded-md border border-rule bg-paper-raised px-6 py-8 sm:px-8 sm:py-10">
          <p className="font-mono text-xs uppercase tracking-[0.03em] text-muted">
            404 · Not found
          </p>

          <h1 className="mt-3 font-reading text-3xl leading-tight text-ink">
            This page doesn&rsquo;t exist.
          </h1>

          <p className="mt-3 font-ui text-sm leading-relaxed text-muted">
            It may have been moved, or the link may be wrong. Head back to your
            research workspace.
          </p>

          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md bg-pine px-5 py-3 font-ui text-sm font-medium text-paper transition-colors hover:bg-pine-dim"
            >
              Back to your workspace
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
