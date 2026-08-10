import { FileText, MoreHorizontal, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { documents } from "@/data/research";

export default function DocumentsPage() {
  return (
    <AppShell title="Documents">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col items-start gap-4 border-b border-rule pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Label>Library</Label>

            <h1 className="mt-3 font-reading text-4xl leading-tight">
              Documents
            </h1>

            <p className="mt-3 font-ui text-sm text-muted">
              {documents.length}{" "}
              {documents.length === 1 ? "document" : "documents"} in your
              research library
            </p>
          </div>

          <Button>
            <span className="flex items-center gap-2">
              <Plus size={16} strokeWidth={1.8} />
              Add document
            </span>
          </Button>
        </header>

        <section className="mt-10">
          <div className="hidden grid-cols-[1fr_100px_120px_40px] items-center gap-x-8 border-b border-rule pb-3 sm:grid">
            <Label>Document</Label>
            <Label>Pages</Label>
            <Label>Status</Label>
            <span />
          </div>

          <div>
            {documents.map((document) => (
              <article
                key={document.title}
                className="flex items-start gap-4 border-b border-rule py-5 sm:grid sm:grid-cols-[1fr_100px_120px_40px] sm:items-center sm:gap-x-8"
              >
                <div className="min-w-0 flex-1 sm:flex-none">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="mt-0.5 shrink-0 text-pine">
                      <FileText size={18} strokeWidth={1.6} />
                    </div>

                    <div className="min-w-0">
                      <h2 className="break-words font-reading text-lg text-ink">
                        {document.title}
                      </h2>

                      <p className="mt-1 font-mono text-xs text-muted">
                        {document.type} · Added {document.added}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 sm:hidden">
                        <p className="font-mono text-xs text-muted">
                          {document.pages} pages
                        </p>

                        <p className="font-mono text-xs text-pine">
                          {document.status}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="hidden font-mono text-xs text-muted sm:block">
                  {document.pages} pages
                </p>

                <p className="hidden font-mono text-xs text-pine sm:block">
                  {document.status}
                </p>

                <button
                  aria-label={`More options for ${document.title}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-paper-raised hover:text-ink"
                >
                  <MoreHorizontal size={17} strokeWidth={1.7} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 border-t border-rule pt-8">
          <div className="max-w-lg">
            <Label>Start a research project</Label>

            <p className="mt-3 font-reading text-xl leading-relaxed text-ink">
              Upload papers to begin asking questions about your research.
            </p>

            <p className="mt-2 font-ui text-sm leading-relaxed text-muted">
              Your documents will be processed and made searchable before you
              start a conversation.
            </p>

            <div className="mt-5">
              <Button variant="secondary">Add your first document</Button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
