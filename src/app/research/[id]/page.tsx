import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Answer, Citation } from "@/components/research/Answer";
import { MarginNote } from "@/components/research/MarginNote";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { workspaces } from "@/data/research";

export function generateStaticParams() {
  return workspaces.map((workspace) => ({ id: workspace.id }));
}

export default async function ResearchConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = workspaces.find((item) => item.id === id);

  if (!workspace) notFound();

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-rule pb-8">
          <Label>Research</Label>

          <h1 className="mt-3 font-reading text-4xl leading-tight">
            {workspace.title}
          </h1>

          <p className="mt-3 font-mono text-xs text-muted">
            {workspace.documents} documents · Updated {workspace.updated}
          </p>
        </header>

        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,68ch)_280px] lg:justify-center">
          <section className="min-w-0">
            <div className="mb-5">
              <Label>Question</Label>

              <p className="mt-2 font-reading text-[1.0625rem] leading-[1.65] text-ink-soft">
                How does rainfall onset vary across the study region?
              </p>
            </div>

            <Answer>
              <p>
                Rainfall onset varies across the study region, with the
                transition into the wet season occurring earlier in some areas
                and later in others.
                <Citation
                  index={1}
                  sourceName="Rainfall Study · p. 7"
                  retrievedDate="10 Aug 2026"
                  excerpt="The study identifies substantial spatial differences in rainfall onset across the region."
                />
              </p>

              <p className="mt-6">
                The spatial differences are associated with changes in seasonal
                rainfall patterns and atmospheric circulation.
                <Citation
                  index={2}
                  sourceName="Climate Analysis · p. 12"
                  retrievedDate="10 Aug 2026"
                  excerpt="Interannual variability was observed throughout the study period."
                />
              </p>

              <p className="mt-6">
                Interannual variation is also substantial, indicating that
                onset dates should not be treated as fixed characteristics of
                the region.
                <Citation
                  index={3}
                  sourceName="Regional Survey · p. 19"
                  retrievedDate="10 Aug 2026"
                  excerpt="Onset dates show considerable year-to-year variation across stations."
                />
              </p>
            </Answer>

            <div className="mt-12 border-t border-rule pt-6">
              <Label htmlFor="question">Ask another question</Label>

              <Textarea
                id="question"
                className="mt-3 min-h-28"
                placeholder="Ask something about your research..."
              />

              <div className="mt-3 flex justify-end">
                <Button>Ask question</Button>
              </div>
            </div>
          </section>

          <aside className="hidden lg:block">
            <div className="sticky top-12 space-y-8">
              <MarginNote
                sourceName="Rainfall Study · p. 7"
                retrievedDate="10 Aug 2026"
                excerpt="The study identifies substantial spatial differences in rainfall onset across the region."
              />

              <MarginNote
                sourceName="Climate Analysis · p. 12"
                retrievedDate="10 Aug 2026"
                excerpt="Interannual variability was observed throughout the study period."
              />

              <MarginNote
                sourceName="Regional Survey · p. 19"
                retrievedDate="10 Aug 2026"
                excerpt="Onset dates show considerable year-to-year variation across stations."
              />
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
