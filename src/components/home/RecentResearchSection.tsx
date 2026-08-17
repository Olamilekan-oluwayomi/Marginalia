import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Label } from "@/components/ui/Label";
import { formatDisplayDate } from "@/lib/dates";
import {
  createSupabaseClient,
  getResearchListWithCounts,
  type ResearchListWithCounts,
} from "@/lib/research";

function toResearchListItem(item: ResearchListWithCounts) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    documentCount: item.document_count,
    updatedAt: item.updated_at,
  };
}

export async function RecentResearchSection() {
  const supabase = await createSupabaseClient();
  const { data, error } = await getResearchListWithCounts(supabase);
  const research = error ? [] : data.map(toResearchListItem);

  return (
    <section className="mt-10">
      <Label>Recent research</Label>

      {error ? (
        <div role="alert" className="border-b border-rule px-4 py-10">
          <h2 className="font-reading text-xl text-error">
            Research couldn&rsquo;t be loaded.
          </h2>
          <p className="mt-3 font-ui text-sm text-muted">
            Try refreshing the page.
          </p>
        </div>
      ) : research.length === 0 ? (
        <div className="border-b border-rule px-4 py-10">
          <h2 className="font-reading text-xl text-ink">
            Your research desk is empty.
          </h2>
          <p className="mt-3 font-ui text-sm text-muted">
            Start a research workspace to begin exploring a question.
          </p>
        </div>
      ) : (
        <div className="mt-0">
          {research.map((item) => (
            <Link
              key={item.id}
              href={`/research/${item.id}`}
              aria-label={`Open ${item.title}`}
              className="group flex items-start justify-between gap-4 border-b border-rule px-4 py-6 transition-colors last:border-b-0 hover:bg-paper-raised sm:gap-8"
            >
              <div className="min-w-0 max-w-2xl">
                <h2 className="break-words font-reading text-2xl text-ink transition-colors group-hover:text-pine-dim">
                  {item.title}
                </h2>
                {item.description ? (
                  <p className="mt-3 font-ui text-sm leading-relaxed text-muted">
                    {item.description}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="font-mono text-xs text-muted">
                    {item.documentCount}{" "}
                    {item.documentCount === 1 ? "document" : "documents"}
                  </span>
                  <span className="font-mono text-xs text-muted">
                    Updated {formatDisplayDate(item.updatedAt)}
                  </span>
                </div>
              </div>
              <ArrowRight
                size={17}
                strokeWidth={1.6}
                className="mt-1 shrink-0 text-muted transition-colors md:opacity-0 md:group-hover:text-pine md:group-hover:opacity-100"
              />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
