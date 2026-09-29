import { ArrowRight, FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { formatDisplayDate } from "@/lib/dates";
import {
  createSupabaseClient,
  getResearchListWithCounts,
  type ResearchListWithCounts,
} from "@/lib/research";

type ResearchListItem = {
  id: string;
  title: string;
  description: string | null;
  documentCount: number;
  updatedAt: string;
};

function toResearchListItem(item: ResearchListWithCounts): ResearchListItem {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    documentCount: item.document_count,
    updatedAt: item.updated_at,
  };
}

export const metadata: Metadata = {
  title: "Research",
  description:
    "Organize papers into focused research spaces and ask questions across your sources.",
};

export default async function ResearchPage() {
  const supabase = await createSupabaseClient();
  const { data, error } = await getResearchListWithCounts(supabase);
  const research = error ? [] : data.map(toResearchListItem);

  return (
    <AppShell title="Research">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col items-start gap-4 border-b border-rule pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Label>Research</Label>

            <h1 className="mt-3 font-reading text-4xl leading-tight">
              Your research
            </h1>

            <p className="mt-3 max-w-xl font-ui text-sm text-muted">
              Organize papers into focused research spaces and ask questions
              across your sources.
            </p>
          </div>

          <Button href="/research/new">
            <span className="flex items-center gap-2">
              <Plus size={16} strokeWidth={1.8} />
              New workspace
            </span>
          </Button>
        </header>

        <section className="mt-10">
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
            <div className="space-y-0">
              {research.map((item) => (
                <Link
                  key={item.id}
                  href={`/research/${item.id}`}
                  aria-label={`Open ${item.title}`}
                  className="group flex items-start justify-between gap-4 border-b border-rule px-4 py-7 transition-colors last:border-b-0 hover:bg-paper-raised sm:gap-8"
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
                      <span className="flex items-center gap-2 font-mono text-xs text-muted">
                        <FileText size={14} strokeWidth={1.5} />
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

        <section className="mt-16 border-t border-rule pt-8">
          <Label>Begin</Label>

          <div className="mt-4 max-w-xl">
            <p className="font-reading text-xl leading-relaxed">
              Create a workspace for a question you&rsquo;re trying to answer.
            </p>

            <p className="mt-2 font-ui text-sm leading-relaxed text-muted">
              Add your papers, then use the research assistant to find
              connections across them.
            </p>

            <div className="mt-5">
              <Button variant="secondary" href="/research/new">
                Create workspace
              </Button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
