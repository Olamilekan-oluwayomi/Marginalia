import { Fragment } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Answer } from "@/components/research/Answer";
import { Citation } from "@/components/research/Citation";
import { MarginNote } from "@/components/research/MarginNote";
import { QuestionComposer } from "@/components/research/QuestionComposer";
import { QuestionStatusBadge } from "@/components/research/QuestionStatusBadge";
import { QuestionStatusPoller } from "@/components/research/QuestionStatusPoller";
import { RetryAnswer } from "@/components/research/RetryAnswer";
import { StuckAnswerRecovery } from "@/components/research/StuckAnswerRecovery";
import { AddSourceForm } from "@/components/research/AddSourceForm";
import { SourceActions } from "@/components/research/SourceActions";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { formatDisplayDate } from "@/lib/dates";
import {
  documentStatusClass,
  documentStatusLabel,
  fileTypeFromName,
  formatFileSize,
} from "@/lib/document-format";
import { hostnameFromUrl } from "@/lib/source-format";
import {
  splitAnswerMarkers,
  splitAnswerParagraphs,
} from "@/lib/research/answer-format";
import {
  createSupabaseClient,
  getResearchWorkspace,
  type AnswerStatus,
  type CitationRow,
  type ResearchWorkspace,
} from "@/lib/research";

/**
 * Generation (context retrieval, optional web research, Gemini) runs after the
 * response is sent; on serverless platforms this caps how long that background
 * work may take. 60s fits the deployment's typical provider round trips; the
 * platform still enforces its own upper bound.
 */
export const maxDuration = 60;

/**
 * Dynamic page title: a single lightweight lookup of the research record so
 * the browser tab (and any crawler) reflects the actual workspace name. The
 * root layout's `%s — Marginalia` template is applied automatically.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseClient();
  const { data } = await supabase
    .from("research")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return { title: data?.title ?? "Research" };
}

type CitationNote = {
  /** Persisted citation row id; the unique key and scroll target. */
  id: string;
  number: number;
  sourceName: string;
  date: string;
  excerpt?: string;
};

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
    id: citation.id,
    number: citation.citation_number,
    sourceName,
    date,
    excerpt: citation.excerpt ?? undefined,
  };
}

/**
 * Renders one answer paragraph with its inline `[n]` citation markers turned
 * into interactive citation buttons. A marker becomes a button only when the
 * current answer actually persisted a citation with that number (answer-local
 * mapping); any other `[n]` is left as plain text.
 */
function renderParagraph(
  paragraph: string,
  paragraphIndex: number,
  notesByNumber: Map<number, CitationNote>
) {
  const segments = splitAnswerMarkers(paragraph);
  const children: React.ReactNode[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment.kind === "marker") {
      const note = notesByNumber.get(segment.number);
      if (note) {
        children.push(
          <Citation
            key={`${note.id}-${index}`}
            index={note.number}
            sourceName={note.sourceName}
            retrievedDate={note.date}
            excerpt={note.excerpt}
            targetId={note.id}
          />
        );
      } else {
        children.push(
          <Fragment key={`text-${index}`}>{`[${segment.number}]`}</Fragment>
        );
      }
    } else {
      children.push(<Fragment key={`text-${index}`}>{segment.text}</Fragment>);
    }
  }

  return (
    <p
      key={paragraphIndex}
      className={paragraphIndex === 0 ? undefined : "mt-6"}
    >
      {children}
    </p>
  );
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
    if (splitAnswerParagraphs(latest.content).length === 0) continue;
    for (const citation of latest.citations) {
      notes.push(toCitationNote(citation, workspace));
    }
  }
  notes.sort((a, b) => a.number - b.number);

  const hasWaitingQuestions = questions.some(
    (question) =>
      question.answer_status === "pending" ||
      question.answer_status === "generating"
  );

  return (
    <AppShell title={research.title}>
      <QuestionStatusPoller isWaiting={hasWaitingQuestions} />
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-rule pb-8">
          <Label>Research</Label>

          <h1 className="mt-3 break-words font-reading text-4xl leading-tight">
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
                    ? splitAnswerParagraphs(latest.content)
                    : [];

                  const answerNotes = latest
                    ? latest.citations
                        .slice()
                        .sort(
                          (a, b) => a.citation_number - b.citation_number
                        )
                        .map((citation) => toCitationNote(citation, workspace))
                    : [];

                  const notesByNumber = new Map(
                    answerNotes.map((note) => [note.number, note] as const)
                  );

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

                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <QuestionStatusBadge
                            status={
                              question.answer_status as AnswerStatus
                            }
                          />

                          <span className="font-mono text-xs text-muted">
                            Asked{" "}
                            {formatDisplayDate(question.created_at)}
                          </span>
                        </div>

                        {/*
                          Live region so assistive tech announces the outcome
                          of background generation. While waiting, the visible
                          status block below (role="status") announces the
                          in-progress state; this sr-only region announces the
                          terminal states the waiting block disappears into.
                        */}
                        {question.answer_status === "complete" ||
                        question.answer_status === "failed" ? (
                          <p className="sr-only" role="status">
                            {question.answer_status === "complete"
                              ? "Answer complete."
                              : "Answer failed."}
                          </p>
                        ) : null}
                      </div>

                      {paragraphs.length > 0 ? (
                        <Answer>
                          {paragraphs.map((paragraph, index) =>
                            renderParagraph(paragraph, index, notesByNumber)
                          )}

                          {latest!.fallback_reason ? (
                            <p className="mt-4 font-ui text-sm text-muted">
                              {latest!.fallback_reason}
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
                      ) : isWaiting ? (
                        <div
                          className="mt-3"
                          role="status"
                          aria-live="polite"
                        >
                          <p className="font-ui text-xs text-muted">
                            {question.answer_status === "generating"
                              ? "Reading your research and writing an answer…"
                              : "Waiting to start…"}
                          </p>

                          <span
                            aria-hidden="true"
                            className="query-loading mt-2 block h-px bg-ochre"
                          />

                          <StuckAnswerRecovery
                            researchId={research.id}
                            questionId={question.id}
                            createdAt={question.created_at}
                          />
                        </div>
                      ) : null}
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
                  <div
                    key={note.id}
                    id={`citation-${note.id}`}
                    tabIndex={-1}
                    className="scroll-mt-24 rounded-md px-3 py-2"
                  >
                    <MarginNote
                      number={note.number}
                      sourceName={note.sourceName}
                      retrievedDate={note.date}
                      excerpt={note.excerpt}
                    />
                  </div>
                ))}
              </div>
            </aside>
          ) : null}
        </div>

        <section className="mt-16 border-t border-rule pt-8">
          <Label>Documents</Label>

          {documents.length === 0 ? (
            <div className="mt-4 rounded-md border border-rule px-4 py-10">
              <h2 className="font-reading text-xl text-ink">
                No documents yet.
              </h2>

              <p className="mt-3 font-ui text-sm text-muted">
                Upload a PDF to add searchable evidence to this research.
              </p>

              <div className="mt-5">
                <Button variant="secondary" href="/documents">
                  Add a document
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="border-b border-rule py-4 sm:flex sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-col gap-y-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                      <h3 className="break-words font-reading text-lg leading-snug text-ink">
                        {document.title}
                      </h3>

                      <span
                        className={`font-mono text-xs sm:whitespace-nowrap ${documentStatusClass(
                          document.status
                        )}`}
                      >
                        {documentStatusLabel(document.status)}
                      </span>
                    </div>

                    <p className="mt-1 font-mono text-xs text-muted">
                      {/* Each part stays intact (no lone "2026" wraps);
                          the group wraps between parts instead. */}
                      {[
                        fileTypeFromName(document.file_name),
                        formatFileSize(document.file_size),
                        `Added ${formatDisplayDate(document.created_at)}`,
                      ]
                        .filter(Boolean)
                        .map((part, index) => (
                          <span key={index} className="whitespace-nowrap">
                            {index > 0 ? " · " : ""}
                            {part}
                          </span>
                        ))}
                    </p>

                    {document.status !== "ready" ? (
                      <p className="mt-1 font-ui text-xs text-muted">
                        {document.status === "failed"
                          ? "Processing failed — this document can&rsquo;t be used as evidence."
                          : "This document isn&rsquo;t searchable yet."}
                      </p>
                    ) : (
                      <p className="mt-1 font-ui text-xs text-pine">
                        Searchable as evidence.
                      </p>
                    )}
                  </div>

                  <div className="mt-3 sm:mt-0 sm:shrink-0">
                    <DocumentActions
                      documentId={document.id}
                      title={document.title}
                      status={document.status}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-16 border-t border-rule pt-8">
          <Label>Sources</Label>

          {sources.length === 0 ? (
            <div className="mt-4 rounded-md border border-rule px-4 py-10">
              <h2 className="font-reading text-xl text-ink">
                No sources yet.
              </h2>

              <p className="mt-3 font-ui text-sm text-muted">
                Sources are added automatically when you search the web, or
                from the form below.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              {sources.map((source) => {
                const hostname = hostnameFromUrl(source.url);

                const meta = [
                  "Web source",
                  source.publisher,
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
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 className="break-words font-reading text-lg leading-snug text-ink">
                          {source.title}
                        </h3>

                        <span
                          className={`font-mono text-xs ${
                            source.has_content ? "text-pine" : "text-muted"
                          }`}
                        >
                          {source.has_content
                            ? "Citable"
                            : "Metadata only"}
                        </span>
                      </div>

                      {meta.length > 0 ? (
                        <p className="mt-1 font-mono text-xs text-muted">
                          {meta.join(" · ")}
                        </p>
                      ) : null}

                      {source.has_content ? (
                        <p className="mt-1 font-ui text-xs text-pine">
                          Searchable as evidence.
                        </p>
                      ) : (
                        <p className="mt-1 font-ui text-xs text-muted">
                          Not citable until body text is added.
                        </p>
                      )}

                      {hostname ? (
                        <a
                          href={source.url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block max-w-full truncate font-mono text-xs text-pine underline decoration-pine/40 underline-offset-2 hover:text-pine-dim"
                        >
                          {hostname}
                        </a>
                      ) : null}
                    </div>

                    <SourceActions sourceId={source.id} title={source.title} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-16 border-t border-rule pt-8">
          <Label>Add a source</Label>

          <p className="mt-2 max-w-2xl font-ui text-sm leading-relaxed text-muted">
            Link a website or paper, and paste its body text so it can be
            cited in generated answers.
          </p>

          <div className="mt-4 max-w-3xl">
            <AddSourceForm researchId={id} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
