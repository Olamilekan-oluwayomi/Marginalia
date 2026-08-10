import { ArrowRight, FileText, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

const workspaces = [
  {
    title: "Rainfall variability and seasonal onset",
    description:
      "Investigating rainfall onset, peak and retreat dates across the study region.",
    documents: 3,
    updated: "Today",
  },
  {
    title: "Climate change literature review",
    description:
      "Collection of papers examining recent climate variability and trends.",
    documents: 7,
    updated: "Yesterday",
  },
];

export default function ResearchPage() {
  return (
    <AppShell>
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

          <Button>
            <span className="flex items-center gap-2">
              <Plus size={16} strokeWidth={1.8} />
              New workspace
            </span>
          </Button>
        </header>

        <section className="mt-10">
          <div className="space-y-0">
            {workspaces.map((workspace) => (
              <article
                key={workspace.title}
                className="group border-b border-rule py-7 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-4 sm:gap-8">
                  <div className="min-w-0 max-w-2xl">
                    <h2 className="break-words font-reading text-2xl text-ink">
                      {workspace.title}
                    </h2>

                    <p className="mt-3 font-ui text-sm leading-relaxed text-muted">
                      {workspace.description}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <span className="flex items-center gap-2 font-mono text-xs text-muted">
                        <FileText size={14} strokeWidth={1.5} />
                        {workspace.documents} documents
                      </span>

                      <span className="font-mono text-xs text-muted">
                        Updated {workspace.updated}
                      </span>
                    </div>
                  </div>

                  <button
                    aria-label={`Open ${workspace.title}`}
                    className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-opacity md:opacity-0 md:group-hover:bg-paper-raised md:group-hover:text-pine md:group-hover:opacity-100"
                  >
                    <ArrowRight size={17} strokeWidth={1.6} />
                  </button>
                </div>
              </article>
            ))}
          </div>
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
              <Button variant="secondary">Create workspace</Button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
