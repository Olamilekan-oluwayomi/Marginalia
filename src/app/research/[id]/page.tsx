import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Answer } from "@/components/research/Answer";
import { Citation } from "@/components/research/Citation";
import { MarginNote } from "@/components/research/MarginNote";
import { QuestionComposer } from "@/components/research/QuestionComposer";
import { RetryAnswer } from "@/components/research/RetryAnswer";
import { Label } from "@/components/ui/Label";
import { formatDisplayDate } from "@/lib/dates";
import { fileTypeFromName } from "@/lib/document-format";
import {
  createSupabaseClient,
  getResearchWorkspace,
  type CitationRow,
  type ResearchWorkspace,
} from "@/lib/research";

type CitationNote = {
  number: number;
  sourceName: string;
  date: string;
  excerpt?: string;
};

function toParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function toCitationNote(
  citation: CitationRow,
  workspace: Pick<ResearchWorkspace, "documents" | "sources">
): CitationNote {
  let sourceName = "";
  let date = "";

  if (citation.document_id) {
    const document = workspace.documents.find(
      (item) => item.id === citation.document_id
    );
    sourceName = document?.title ?? "Document";
    date = document ? formatDisplayDate(document.created_at) : "";
  } else if (citation.source_id) {
    const source = workspace.sources.find(
      (item) => item.id === citation.source_id
    );
    sourceName = source?.title ?? "Source";
    date = source?.retrieved_at ? formatDisplayDate(source.retrieved_at) : "";
  }

  return {
    number: citation.citation_number,
    sourceName,
    date,
    excerpt: citation.excerpt ?? undefined,
  };
}

export default async function ResearchWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseClient();
  const { data: workspace, error } = await getResearchWorkspace(supabase, id);

  if (error) {
    if (error.code === "NOT_FOUND" || error.code === "UNAUTHORIZED") {
      notFound();
    }

    return (
      <AppShell title="Research">
        <div className="mx-auto max-w-6xl">
          <div role="alert" className="border-b border-rule px-4 py-10">
            <h1 className="font-reading text-2xl text-error">
              This workspace couldn&rsquo;t be loaded.
            </h1>

            <p className="mt-3 font-ui text-sm text-muted">
              Try refreshing the page.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!workspace) notFound();

  const { research, questions, documents, sources } = workspace;

  const notes: CitationNote[] = [];
  for (const question of questions) {
    if (question.answer_status !== "complete") continue;
    const latest = question.answers[question.answers.length - 1];
    if (!latest) continue;
    if (toParagraphs(latest.content).length === 0) continue;
    for (const citation of latest.citations) {
      notes.push(toCitationNote(citation, workspace));
    }
  }
  notes.sort((a, b) => a.number - b.number);

  return (
    <AppShell title={research.title}>
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-rule pb-8">
          <Label>Research</Label>

          <h1 className="mt-3 font-reading text-4xl leading-tight">
            {research.title}
          </h1>

          {research.description ? (
            <p className="mt-3 max-w-xl font-ui text-sm leading-relaxed text-muted">
              {research.description}
            </p>
          ) : null}

          <p className="mt-3 font-mono text-xs text-muted">
            {documents.length}{" "}
            {documents.length === 1 ? "document" : "documents"} · Updated{" "}
            {formatDisplayDate(research.updated_at)}
          </p>
        </header>

        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,68ch)_280px] lg:justify-center">
          <section className="min-w-0">
            {questions.length === 0 ? (
              <div>
                <Label>Question</Label>

                <p className="mt-2 font-reading text-[1.0625rem] leading-[1.65] text-ink-soft">
                  Begin with a research question.
                </p>

                <p className="mt-3 max-w-xl font-ui text-sm leading-relaxed text-muted">
                  Ask something about your research, and Marginalia will find
                  the connections across your documents and sources.
                </p>
              </div>
            ) : (
              <div>
                {questions.map((question) => {
                  const latest =
                    question.answer_status === "complete" &&
                    question.answers.length > 0
                      ? question.answers[question.answers.length - 1]
                      : null;

                  const paragraphs = latest
                    ? toParagraphs(latest.content)
                    : [];

                  const answerNotes = latest
                    ? latest.citations
                        .slice()
                        .sort(
                          (a, b) => a.citation_number - b.citation_number
                        )
                        .map((citation) => toCitationNote(citation, workspace))
                    : [];

                  const isWaiting =
                    question.answer_status === "pending" ||
                    question.answer_status === "generating";

                  return (
                    <article key={question.id} className="mb-14">
                      <div className="mb-5">
                        <Label>Question</Label>

                        <p className="mt-2 font-reading text-[1.0625rem] leading-[1.65] text-ink-soft">
                          {question.question}
                        </p>

                        {isWaiting ? (
                          <span
                            aria-hidden="true"
                            className="query-loading mt-2 block h-px bg-ochre"
                          />
                        ) : null}
                      </div>

                      {paragraphs.length > 0 ? (
                        <Answer>
                          {paragraphs.map((paragraph, index) => (
                            <p
                              key={index}
                              className={index === 0 ? undefined : "mt-6"}
                            >
                              {paragraph}
                            </p>
                          ))}

                          {answerNotes.length > 0 ? (
                            <p className="mt-6">
                              {answerNotes.map((note) => (
                                <Citation
                                  key={`${latest!.id}-${note.number}`}
                                  index={note.number}
                                  sourceName={note.sourceName}
                                  retrievedDate={note.date}
                                  excerpt={note.excerpt}
                                />
                              ))}
                            </p>
                          ) : null}

                          {latest!.model ? (
                            <p className="mt-6 font-mono text-xs text-muted">
                              Generated with {latest!.model}
                            </p>
                          ) : null}
                        </Answer>
                      ) : question.answer_status === "failed" ? (
                        <div className="mt-3">
                          <p className="font-ui text-sm text-error">
                            This answer couldn&rsquo;t be generated.
                          </p>

                          <div className="mt-4">
                            <RetryAnswer
                              researchId={research.id}
                              questionId={question.id}
                            />
                          </div>
                        </div>
                      ) : question.answer_status === "complete" ? (
                        <div className="mt-3">
                          <p className="font-ui text-sm text-error">
                            This answer came back empty.
                          </p>

                          <p className="mt-1 font-ui text-xs text-muted">
                            Ask the question again to try once more.
                          </p>
                        </div>
                      ) : (
                        <p className="sr-only">Working on this answer.</p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            <div className="mt-12 border-t border-rule pt-6">
              <QuestionComposer researchId={research.id} />
            </div>
          </section>

          {notes.length > 0 ? (
            <aside className="hidden lg:block">
              <div className="sticky top-12 space-y-8">
                {notes.map((note) => (
                  <MarginNote
                    key={`${note.number}-${note.sourceName}`}
                    number={note.number}
                    sourceName={note.sourceName}
                    retrievedDate={note.date}
                    excerpt={note.excerpt}
                  />
                ))}
              </div>
            </aside>
          ) : null}
        </div>

        {documents.length > 0 ? (
          <section className="mt-16 border-t border-rule pt-8">
            <Label>Documents</Label>

            <div className="mt-4">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="flex items-start justify-between gap-4 border-b border-rule py-4"
                >
                  <div className="min-w-0">
                    <h3 className="break-words font-reading text-lg leading-snug text-ink">
                      {document.title}
                    </h3>

                    <p className="mt-1 font-mono text-xs text-muted">
                      {fileTypeFromName(document.file_name)} · Added{" "}
                      {formatDisplayDate(document.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {sources.length > 0 ? (
          <section className="mt-16 border-t border-rule pt-8">
            <Label>Sources</Label>

            <div className="mt-4">
              {sources.map((source) => {
                const meta = [
                  source.publisher,
                  source.url,
                  source.retrieved_at
                    ? `Retrieved ${formatDisplayDate(source.retrieved_at)}`
                    : undefined,
                ].filter((part): part is string => Boolean(part));

                return (
                  <div
                    key={source.id}
                    className="flex items-start justify-between gap-4 border-b border-rule py-4"
                  >
                    <div className="min-w-0">
                      <h3 className="break-words font-reading text-lg leading-snug text-ink">
                        {source.title}
                      </h3>

                      {meta.length > 0 ? (
                        <p className="mt-1 font-mono text-xs text-muted">
                          {meta.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
