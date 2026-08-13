import { AppShell } from "@/components/layout/AppShell";

export default function ResearchWorkspaceLoading() {
  return (
    <AppShell title="Research">
      <div className="mx-auto max-w-6xl">
        <div aria-hidden="true">
          <header className="border-b border-rule pb-8">
            <div className="query-loading h-3 w-16 rounded-sm bg-paper-raised" />

            <div className="query-loading mt-4 h-10 w-2/3 max-w-lg rounded-sm bg-paper-raised" />

            <div className="query-loading mt-3 h-4 w-1/2 max-w-sm rounded-sm bg-paper-raised" />

            <div className="query-loading mt-3 h-3 w-44 rounded-sm bg-paper-raised" />
          </header>

          <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,68ch)_280px] lg:justify-center">
            <section className="min-w-0">
              <div className="mb-5">
                <div className="query-loading h-3 w-16 rounded-sm bg-paper-raised" />

                <div className="query-loading mt-3 h-7 w-full rounded-sm bg-paper-raised" />

                <div className="query-loading mt-2 h-7 w-2/3 rounded-sm bg-paper-raised" />
              </div>

              <div className="space-y-2">
                <div className="query-loading h-4 w-full rounded-sm bg-paper-raised" />

                <div className="query-loading h-4 w-11/12 rounded-sm bg-paper-raised" />

                <div className="query-loading h-4 w-4/5 rounded-sm bg-paper-raised" />
              </div>

              <div className="mt-6 space-y-2">
                <div className="query-loading h-4 w-10/12 rounded-sm bg-paper-raised" />

                <div className="query-loading h-4 w-2/3 rounded-sm bg-paper-raised" />

                <div className="query-loading h-4 w-3/4 rounded-sm bg-paper-raised" />
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                <div className="query-loading h-5 w-24 rounded-sm bg-paper-raised" />

                <div className="query-loading h-5 w-28 rounded-sm bg-paper-raised" />

                <div className="query-loading h-5 w-20 rounded-sm bg-paper-raised" />
              </div>

              <div className="mt-12 border-t border-rule pt-6">
                <div className="query-loading h-3 w-36 rounded-sm bg-paper-raised" />

                <div className="query-loading mt-3 h-28 w-full rounded-md border border-rule bg-paper-raised" />

                <div className="query-loading mt-4 h-4 w-44 rounded-sm bg-paper-raised" />

                <div className="query-loading mt-3 ml-auto h-10 w-36 rounded-sm bg-paper-raised" />
              </div>
            </section>

            <aside className="hidden lg:block">
              <div className="sticky top-12 space-y-8">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="border-t border-rule pt-2">
                    <div className="query-loading h-3 w-32 rounded-sm bg-paper-raised" />

                    <div className="query-loading mt-2 h-4 w-full rounded-sm bg-paper-raised" />

                    <div className="query-loading mt-1.5 h-4 w-3/4 rounded-sm bg-paper-raised" />
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <section className="mt-16 border-t border-rule pt-8">
            <div className="query-loading h-3 w-20 rounded-sm bg-paper-raised" />

            <div className="mt-4">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="flex items-start justify-between gap-4 border-b border-rule py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="query-loading h-5 w-56 max-w-full rounded-sm bg-paper-raised" />

                    <div className="query-loading mt-2 h-3 w-40 rounded-sm bg-paper-raised" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-16 border-t border-rule pt-8">
            <div className="query-loading h-3 w-24 rounded-sm bg-paper-raised" />

            <div className="query-loading mt-3 h-4 w-2/3 max-w-xl rounded-sm bg-paper-raised" />

            <div className="query-loading mt-4 h-11 w-full max-w-3xl rounded-md border border-rule bg-paper-raised" />
          </section>
        </div>

        <p role="status" className="sr-only">
          Loading this research workspace…
        </p>
      </div>
    </AppShell>
  );
}
