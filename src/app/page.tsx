import { ArrowRight, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { recentDocuments, workspaces } from "@/data/research";

export default function Home() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-rule pb-8">
          <Label>Workspace</Label>

          <h1 className="mt-3 font-reading text-4xl leading-tight">
            Good morning
          </h1>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-ui text-sm text-muted">
              Continue your research or start something new.
            </p>

            <Button>
              <span className="flex items-center gap-2">
                <Plus size={16} strokeWidth={1.8} />
                New research
              </span>
            </Button>
          </div>
        </header>

        <section className="mt-10">
          <Label>Recent research</Label>

          <div className="mt-0">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.id}
                href={`/research/${workspace.id}`}
                aria-label={`Open ${workspace.title}`}
                className="group flex items-start justify-between gap-4 border-b border-rule py-6 transition-colors hover:bg-paper-raised sm:gap-8"
              >
                <div className="min-w-0 max-w-2xl">
                  <h2 className="break-words font-reading text-2xl text-ink transition-colors group-hover:text-pine-dim">
                    {workspace.title}
                  </h2>

                  <p className="mt-3 font-ui text-sm leading-relaxed text-muted">
                    {workspace.description}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <span className="font-mono text-xs text-muted">
                      {workspace.documents} documents
                    </span>

                    <span className="font-mono text-xs text-muted">
                      Updated {workspace.updated}
                    </span>
                  </div>
                </div>

                <ArrowRight
                  size={17}
                  strokeWidth={1.6}
                  className="mt-1 shrink-0 text-muted transition-colors group-hover:text-pine"
                />
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <Label>Recent documents</Label>

          <div>
            {recentDocuments.map((document) => (
              <Link
                key={document.title}
                href="/documents"
                aria-label={`Open ${document.title}`}
                className="group flex items-start justify-between gap-4 border-b border-rule py-5 transition-colors hover:bg-paper-raised"
              >
                <div className="flex min-w-0 items-start gap-4">
                  <div className="mt-0.5 shrink-0 text-pine">
                    <FileText size={18} strokeWidth={1.6} />
                  </div>

                  <div className="min-w-0">
                    <h2 className="break-words font-reading text-lg text-ink transition-colors group-hover:text-pine-dim">
                      {document.title}
                    </h2>

                    <p className="mt-1 font-mono text-xs text-muted">
                      {document.type} · Added {document.added}
                    </p>
                  </div>
                </div>

                <ArrowRight
                  size={17}
                  strokeWidth={1.6}
                  className="mt-1 shrink-0 text-muted transition-colors group-hover:text-pine"
                />
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-16 border-t border-rule pt-8">
          <div className="max-w-lg">
            <Label>Have a paper to explore?</Label>

            <p className="mt-3 font-reading text-xl leading-relaxed text-ink">
              Add a document to begin building your research library.
            </p>

            <div className="mt-5">
              <Button variant="secondary">Add document</Button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
