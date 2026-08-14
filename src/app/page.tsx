import { ArrowRight, FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Greeting } from "@/components/profile/Greeting";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { fileTypeFromName } from "@/lib/document-format";
import { formatDisplayDate } from "@/lib/dates";
import {
  createSupabaseClient,
  getAllDocuments,
  getResearchListWithCounts,
  type DocumentSummary,
  type ResearchListWithCounts,
} from "@/lib/research";

type ResearchListItem = {
  id: string;
  title: string;
  description: string | null;
  documentCount: number;
  updatedAt: string;
};

type RecentDocumentItem = {
  id: string;
  title: string;
  fileType: string;
  addedAt: string;
};

const RECENT_DOCUMENT_LIMIT = 4;

export const metadata: Metadata = {
  title: "Workspace",
  description: "Continue your research or start something new in Marginalia.",
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

function toRecentDocumentItem(item: DocumentSummary): RecentDocumentItem {
  return {
    id: item.id,
    title: item.title,
    fileType: fileTypeFromName(item.file_name),
    addedAt: formatDisplayDate(item.created_at),
  };
}

export default async function Home() {
  const supabase = await createSupabaseClient();
  const [researchResult, documentsResult] = await Promise.all([
    getResearchListWithCounts(supabase),
    getAllDocuments(supabase),
  ]);
  const { data, error } = researchResult;
  const { data: docsData, error: docsError } = documentsResult;
  const research = error ? [] : data.map(toResearchListItem);
  const documents = docsError ? [] : docsData.map(toRecentDocumentItem);
  const recentDocuments = documents.slice(0, RECENT_DOCUMENT_LIMIT);

  return (
    <AppShell title="Workspace">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-rule pb-8">
          <Label>Workspace</Label>

          <h1 className="mt-3 font-reading text-4xl leading-tight">
            <Greeting />
          </h1>

          <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-ui text-sm text-muted">
              Continue your research or start something new.
            </p>

            <Button href="/research/new">
              <span className="flex items-center gap-2">
                <Plus size={16} strokeWidth={1.8} />
                New research
              </span>
            </Button>
          </div>
        </header>

        <section className="mt-10">
          <Label>Recent research</Label>

          {error ? (
            <div
              role="alert"
              className="border-b border-rule px-4 py-10"
            >
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

        <section className="mt-12">
          <Label>Recent documents</Label>

          {docsError ? (
            <div
              role="alert"
              className="border-b border-rule px-4 py-10"
            >
              <h2 className="font-reading text-xl text-error">
                Documents couldn&rsquo;t be loaded.
              </h2>

              <p className="mt-3 font-ui text-sm text-muted">
                Try refreshing the page.
              </p>
            </div>
          ) : recentDocuments.length === 0 ? (
            <div className="border-b border-rule px-4 py-10">
              <h2 className="font-reading text-xl text-ink">
                No documents yet.
              </h2>

              <p className="mt-3 font-ui text-sm text-muted">
                Add a document to begin building your research library.
              </p>
            </div>
          ) : (
            <div>
              {recentDocuments.map((document) => (
                <Link
                  key={document.id}
                  href="/documents"
                  aria-label={`Open ${document.title}`}
                  className="group flex items-start justify-between gap-4 border-b border-rule px-4 py-5 transition-colors last:border-b-0 hover:bg-paper-raised"
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
                        {document.fileType} · Added {document.addedAt}
                      </p>
                    </div>
                  </div>

                  <ArrowRight
                    size={17}
                    strokeWidth={1.6}
                    className="mt-1 shrink-0 text-muted transition-colors md:opacity-0 md:group-hover:text-pine md:group-hover:opacity-100"
                  />
                </Link>
              ))}

              {documents.length > recentDocuments.length ? (
                <Link
                  href="/documents"
                  className="group flex items-center justify-between gap-4 px-4 py-5 transition-colors hover:bg-paper-raised"
                >
                  <span className="font-ui text-sm text-ink transition-colors group-hover:text-pine-dim">
                    View all documents
                  </span>

                  <ArrowRight
                    size={17}
                    strokeWidth={1.6}
                    className="shrink-0 text-muted transition-colors md:opacity-0 md:group-hover:text-pine md:group-hover:opacity-100"
                  />
                </Link>
              ) : null}
            </div>
          )}
        </section>

        <section className="mt-16 border-t border-rule pt-8">
          <div className="max-w-lg">
            <Label>Have a paper to explore?</Label>

            <p className="mt-3 font-reading text-xl leading-relaxed text-ink">
              Add a document to begin building your research library.
            </p>

            <div className="mt-5">
              <Button variant="secondary" href="/documents">
                Add document
              </Button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
