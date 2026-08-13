import { AppShell } from "@/components/layout/AppShell";

export default function SettingsLoading() {
  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-3xl">
        <div aria-hidden="true">
          <header className="border-b border-rule pb-8">
            <div className="query-loading h-3 w-16 rounded-sm bg-paper-raised" />

            <div className="query-loading mt-4 h-10 w-40 rounded-sm bg-paper-raised" />

            <div className="query-loading mt-3 h-4 w-72 rounded-sm bg-paper-raised" />
          </header>

          <div className="divide-y divide-rule">
            <section className="py-10">
              <div className="query-loading h-3 w-16 rounded-sm bg-paper-raised" />

              <div className="mt-6">
                <div className="query-loading h-4 w-24 rounded-sm bg-paper-raised" />

                <div className="query-loading mt-1.5 h-4 w-80 max-w-full rounded-sm bg-paper-raised" />

                <div className="mt-6 grid gap-6">
                  <div>
                    <div className="query-loading h-4 w-24 rounded-sm bg-paper-raised" />

                    <div className="query-loading mt-2 h-11 w-full rounded-md border border-rule bg-paper-raised" />
                  </div>

                  <div>
                    <div className="query-loading h-4 w-16 rounded-sm bg-paper-raised" />

                    <div className="query-loading mt-2 h-11 w-full rounded-md border border-rule bg-paper-raised" />
                  </div>
                </div>

                <div className="query-loading mt-6 h-10 w-32 rounded-sm bg-paper-raised" />

                <div className="mt-8 space-y-3 border-t border-rule pt-6">
                  <div className="flex items-baseline justify-between gap-6">
                    <div className="query-loading h-4 w-28 rounded-sm bg-paper-raised" />

                    <div className="query-loading h-4 w-24 rounded-sm bg-paper-raised" />
                  </div>

                  <div className="flex items-baseline justify-between gap-6">
                    <div className="query-loading h-4 w-28 rounded-sm bg-paper-raised" />

                    <div className="query-loading h-4 w-16 rounded-sm bg-paper-raised" />
                  </div>
                </div>
              </div>
            </section>

            <section className="py-10">
              <div className="query-loading h-3 w-20 rounded-sm bg-paper-raised" />

              <div className="mt-6">
                <div className="query-loading h-4 w-20 rounded-sm bg-paper-raised" />

                <div className="query-loading mt-1.5 h-4 w-72 rounded-sm bg-paper-raised" />

                <div className="mt-4 inline-flex rounded-md border border-rule bg-paper-raised p-0.5">
                  <div className="query-loading h-7 w-16 rounded-sm bg-paper" />

                  <div className="query-loading ml-0.5 h-7 w-16 rounded-sm bg-paper" />

                  <div className="query-loading ml-0.5 h-7 w-16 rounded-sm bg-paper" />
                </div>
              </div>
            </section>

            <section className="py-10">
              <div className="query-loading h-3 w-16 rounded-sm bg-paper-raised" />

              <div className="mt-6">
                <div className="query-loading h-4 w-40 rounded-sm bg-paper-raised" />

                <div className="query-loading mt-1.5 h-4 w-64 rounded-sm bg-paper-raised" />

                <div className="query-loading mt-4 h-9 w-28 rounded-sm bg-paper-raised" />
              </div>
            </section>
          </div>
        </div>

        <p role="status" className="sr-only">
          Loading your settings…
        </p>
      </div>
    </AppShell>
  );
}
