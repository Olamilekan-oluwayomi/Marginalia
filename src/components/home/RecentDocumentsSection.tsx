import { FileText, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Label } from "@/components/ui/Label";
import { fileTypeFromName } from "@/lib/document-format";
import { formatDisplayDate } from "@/lib/dates";
import {
  createSupabaseClient,
  getAllDocuments,
  type DocumentSummary,
} from "@/lib/research";

const RECENT_DOCUMENT_LIMIT = 4;

function toRecentDocumentItem(item: DocumentSummary) {
  return {
    id: item.id,
    title: item.title,
    fileType: fileTypeFromName(item.file_name),
    addedAt: formatDisplayDate(item.created_at),
  };
}

export async function RecentDocumentsSection() {
  const supabase = await createSupabaseClient();
  const { data, error } = await getAllDocuments(supabase);
  const docs = error ? [] : data.map(toRecentDocumentItem);
  const recentDocuments = docs.slice(0, RECENT_DOCUMENT_LIMIT);

  return (
    <section className="mt-12">
      <Label>Recent documents</Label>

      {error ? (
        <div role="alert" className="border-b border-rule px-4 py-10">
          <h2 className="font-reading text-xl text-error">
            Documents couldn&rsquo;t be loaded.
          </h2>
          <p className="mt-3 font-ui text-sm text-muted">
            Try refreshing the page.
          </p>
        </div>
      ) : recentDocuments.length === 0 ? (
        <div className="border-b border-rule px-4 py-10">
          <h2 className="font-reading text-xl text-ink">No documents yet.</h2>
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

          {docs.length > recentDocuments.length ? (
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
  );
}
