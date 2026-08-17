export function ResearchSectionSkeleton() {
  return (
    <section className="mt-10" aria-busy="true" aria-label="Loading research">
      <div className="mb-4 h-3 w-28 animate-pulse rounded bg-rule" />
      <div className="space-y-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="border-b border-rule px-4 py-6 last:border-b-0"
          >
            <div className="h-[32px] w-3/4 animate-pulse rounded bg-rule" />
            <div className="mt-3 h-[20px] w-1/2 animate-pulse rounded bg-rule" />
            <div className="mt-4 flex gap-5">
              <div className="h-[16px] w-20 animate-pulse rounded bg-rule" />
              <div className="h-[16px] w-24 animate-pulse rounded bg-rule" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
