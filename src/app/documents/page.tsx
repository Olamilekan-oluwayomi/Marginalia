import { FileText, MoreHorizontal } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AddDocumentForm } from "@/components/documents/AddDocumentForm";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import {
  documentStatusClass,
  documentStatusLabel,
  fileTypeFromName,
} from "@/lib/document-format";
import { formatDisplayDate } from "@/lib/dates";
import {
  createSupabaseClient,
  getAllDocuments,
  getResearchList,
  type DocumentRow,
} from "@/lib/research";

type DocumentListItem = {
  id: string;
  title: string;
  fileType: string;
  addedAt: string;
  status: string;
};

function toDocumentListItem(item: DocumentRow): DocumentListItem {
  return {
    id: item.id,
    title: item.title,
    fileType: fileTypeFromName(item.file_name),
    addedAt: formatDisplayDate(item.created_at),
    status: item.status,
  };
}

export default async function DocumentsPage() {
  const supabase = await createSupabaseClient();
  const [documentsResult, researchResult] = await Promise.all([
    getAllDocuments(supabase),
    getResearchList(supabase),
  ]);
  const { data, error } = documentsResult;
  const documents = error ? [] : data.map(toDocumentListItem);

  const researchOptions = researchResult.error
    ? []
    : researchResult.data.map((research) => ({
        id: research.id,
        title: research.title,
      }));

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
              {error
                ? "Your documents can&rsquo;t be shown right now."
                : `${documents.length} ${
                    documents.length === 1 ? "document" : "documents"
                  } in your research library`}
            </p>
          </div>
        </header>

        <section id="add-document" className="mt-8 rounded-md border border-rule bg-paper-raised p-6">
          <Label>Add a document</Label>

          <p className="mt-2 max-w-2xl font-ui text-sm leading-relaxed text-muted">
            Upload a PDF or plain-text file. Its text is extracted so it can be
            used as evidence in generated answers.
          </p>

          <div className="mt-5">
            <AddDocumentForm researchOptions={researchOptions} />
          </div>
        </section>

        <section className="mt-10">
          <div className="hidden grid-cols-[1fr_120px_40px] items-center gap-x-8 border-b border-rule pb-3 sm:grid">
            <Label>Document</Label>
            <Label>Status</Label>
            <span />
          </div>

          {error ? (
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
          ) : documents.length === 0 ? (
            <div className="border-b border-rule px-4 py-10">
              <h2 className="font-reading text-xl text-ink">
                Your library is empty.
              </h2>

              <p className="mt-3 font-ui text-sm text-muted">
                Add a document to begin building your research library.
              </p>
            </div>
          ) : (
            <div>
              {documents.map((document) => (
                <article
                  key={document.id}
                  className="flex items-start gap-4 border-b border-rule py-5 sm:grid sm:grid-cols-[1fr_120px_40px] sm:items-center sm:gap-x-8"
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
                          {document.fileType} · Added {document.addedAt}
                        </p>

                        <p className="mt-2 font-mono text-xs sm:hidden">
                          <span className={documentStatusClass(document.status)}>
                            {documentStatusLabel(document.status)}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <p
                    className={`hidden font-mono text-xs sm:block ${documentStatusClass(
                      document.status
                    )}`}
                  >
                    {documentStatusLabel(document.status)}
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
          )}
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
              <Button variant="secondary" href="#add-document">
                Add your first document
              </Button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
