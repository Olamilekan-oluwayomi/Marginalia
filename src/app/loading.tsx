import { AppShell } from "@/components/layout/AppShell";

export default function HomeLoading() {
  return (
    <AppShell title="Workspace">
      <div className="mx-auto max-w-5xl">
        <div aria-hidden="true">
          <header className="border-b border-rule pb-8">
            <div className="query-loading h-3 w-16 rounded-sm bg-paper-raised" />

            <div className="query-loading mt-4 h-10 w-72 max-w-full rounded-sm bg-paper-raised" />

            <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="query-loading h-4 w-64 rounded-sm bg-paper-raised" />

              <div className="query-loading h-10 w-32 rounded-sm bg-paper-raised" />
            </div>
          </header>

          <section className="mt-10">
            <div className="query-loading h-3 w-24 rounded-sm bg-paper-raised" />

            <div className="mt-4">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="flex items-start justify-between gap-4 border-b border-rule px-4 py-6 last:border-b-0 sm:gap-8"
                >
                  <div className="min-w-0 max-w-2xl">
                    <div className="query-loading h-6 w-3/4 max-w-md rounded-sm bg-paper-raised" />

                    <div className="query-loading mt-3 h-4 w-1/2 max-w-xs rounded-sm bg-paper-raised" />

                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <div className="query-loading h-3 w-20 rounded-sm bg-paper-raised" />

                      <div className="query-loading h-3 w-28 rounded-sm bg-paper-raised" />
                    </div>
                  </div>

                  <div className="query-loading mt-1.5 h-4 w-4 shrink-0 rounded-sm bg-paper-raised" />
                </div>
              ))}
            </div>
          </section>

          <section className="mt-12">
            <div className="query-loading h-3 w-24 rounded-sm bg-paper-raised" />

            <div className="mt-4">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="flex items-start justify-between gap-4 border-b border-rule px-4 py-5 last:border-b-0"
                >
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="query-loading mt-0.5 h-[18px] w-[18px] shrink-0 rounded-sm bg-paper-raised" />

                    <div className="min-w-0">
                      <div className="query-loading h-5 w-52 max-w-full rounded-sm bg-paper-raised" />

                      <div className="query-loading mt-2 h-3 w-36 rounded-sm bg-paper-raised" />
                    </div>
                  </div>

                  <div className="query-loading mt-1.5 h-4 w-4 shrink-0 rounded-sm bg-paper-raised" />
                </div>
              ))}
            </div>
          </section>

          <section className="mt-16 border-t border-rule pt-8">
            <div className="max-w-lg">
              <div className="query-loading h-3 w-36 rounded-sm bg-paper-raised" />

              <div className="query-loading mt-3 h-5 w-full rounded-sm bg-paper-raised" />

              <div className="query-loading mt-5 h-10 w-32 rounded-sm bg-paper-raised" />
            </div>
          </section>
        </div>

        <p role="status" className="sr-only">
          Loading your workspace…
        </p>
      </div>
    </AppShell>
  );
}
