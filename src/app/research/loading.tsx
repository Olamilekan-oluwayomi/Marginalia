import { AppShell } from "@/components/layout/AppShell";

export default function ResearchLoading() {
  return (
    <AppShell title="Research">
      <div className="mx-auto max-w-5xl">
        <div aria-hidden="true">
          <header className="flex flex-col items-start gap-4 border-b border-rule pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="query-loading h-3 w-16 rounded-sm bg-paper-raised" />

              <div className="query-loading mt-4 h-10 w-56 rounded-sm bg-paper-raised" />

              <div className="query-loading mt-3 h-4 w-80 max-w-full rounded-sm bg-paper-raised" />
            </div>

            <div className="query-loading h-10 w-40 rounded-sm bg-paper-raised" />
          </header>

          <section className="mt-10">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="flex items-start justify-between gap-4 border-b border-rule px-4 py-7 last:border-b-0 sm:gap-8"
              >
                <div className="min-w-0 max-w-2xl">
                  <div className="query-loading h-6 w-3/4 max-w-md rounded-sm bg-paper-raised" />

                  <div className="query-loading mt-3 h-4 w-1/2 max-w-xs rounded-sm bg-paper-raised" />

                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <div className="query-loading h-3 w-24 rounded-sm bg-paper-raised" />

                    <div className="query-loading h-3 w-28 rounded-sm bg-paper-raised" />
                  </div>
                </div>

                <div className="query-loading mt-1.5 h-4 w-4 shrink-0 rounded-sm bg-paper-raised" />
              </div>
            ))}
          </section>

          <section className="mt-16 border-t border-rule pt-8">
            <div className="query-loading h-3 w-14 rounded-sm bg-paper-raised" />

            <div className="mt-4 max-w-xl">
              <div className="query-loading h-5 w-full rounded-sm bg-paper-raised" />

              <div className="query-loading mt-2 h-4 w-2/3 rounded-sm bg-paper-raised" />

              <div className="query-loading mt-5 h-10 w-44 rounded-sm bg-paper-raised" />
            </div>
          </section>
        </div>

        <p role="status" className="sr-only">
          Loading your research…
        </p>
      </div>
    </AppShell>
  );
}
