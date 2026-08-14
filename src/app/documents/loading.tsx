import { AppShell } from "@/components/layout/AppShell";

export default function DocumentsLoading() {
  return (
    <AppShell title="Documents">
      <div className="mx-auto max-w-5xl">
        <div aria-hidden="true">
          <header className="flex flex-col items-start gap-4 border-b border-rule pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="query-loading h-3 w-16 rounded-sm bg-paper-raised" />

              <div className="query-loading mt-4 h-10 w-52 rounded-sm bg-paper-raised" />

              <div className="query-loading mt-3 h-4 w-64 rounded-sm bg-paper-raised" />
            </div>
          </header>

          <section className="mt-8 rounded-md border border-rule bg-paper-raised p-6">
            <div className="query-loading h-3 w-24 rounded-sm bg-paper" />

            <div className="query-loading mt-3 h-4 w-3/4 max-w-xl rounded-sm bg-paper" />

            <div className="mt-5">
              <div className="query-loading h-11 w-full rounded-sm bg-paper" />
            </div>
          </section>

          <section className="mt-10">
            <div className="hidden grid-cols-[1fr_120px_auto] items-center gap-x-8 border-b border-rule pb-3 sm:grid">
              <div className="query-loading h-3 w-16 rounded-sm bg-paper-raised" />

              <div className="query-loading h-3 w-12 rounded-sm bg-paper-raised" />
            </div>

            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="flex items-start gap-4 border-b border-rule py-5 last:border-b-0 sm:grid sm:grid-cols-[1fr_120px_auto] sm:items-center sm:gap-x-8"
              >
                <div className="flex min-w-0 flex-1 items-start gap-4 sm:flex-none">
                  <div className="query-loading mt-0.5 h-[18px] w-[18px] shrink-0 rounded-sm bg-paper-raised" />

                  <div className="min-w-0">
                    <div className="query-loading h-5 w-56 max-w-full rounded-sm bg-paper-raised" />

                    <div className="query-loading mt-2 h-3 w-40 rounded-sm bg-paper-raised" />
                  </div>
                </div>

                <div className="query-loading mt-3 h-3 w-14 rounded-sm bg-paper-raised sm:mt-0" />

                <div className="query-loading ml-auto h-8 w-8 rounded-md bg-paper-raised sm:ml-0" />
              </div>
            ))}
          </section>

          <section className="mt-16 border-t border-rule pt-8">
            <div className="max-w-lg">
              <div className="query-loading h-3 w-36 rounded-sm bg-paper-raised" />

              <div className="query-loading mt-3 h-5 w-full rounded-sm bg-paper-raised" />

              <div className="query-loading mt-2 h-4 w-2/3 rounded-sm bg-paper-raised" />

              <div className="query-loading mt-5 h-10 w-44 rounded-sm bg-paper-raised" />
            </div>
          </section>
        </div>

        <p role="status" className="sr-only">
          Loading your documents…
        </p>
      </div>
    </AppShell>
  );
}
