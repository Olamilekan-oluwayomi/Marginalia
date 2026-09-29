export function DocumentsSectionSkeleton() {
  return (
    <section className="mt-12" aria-busy="true" aria-label="Loading documents">
      <div className="mb-4 h-3 w-32 animate-pulse rounded bg-rule" />
      <div className="space-y-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="border-b border-rule px-4 py-5 last:border-b-0"
          >
            <div className="flex items-start gap-4">
              <div className="mt-0.5 h-[18px] w-[18px] shrink-0 animate-pulse rounded bg-rule" />
              <div className="flex-1">
                <div className="h-[28px] w-2/3 animate-pulse rounded bg-rule" />
                <div className="mt-1 h-[16px] w-1/3 animate-pulse rounded bg-rule" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
