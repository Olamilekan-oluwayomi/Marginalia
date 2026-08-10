import { AppShell } from "@/components/layout/AppShell";
import { Answer, Citation } from "@/components/research/Answer";
import { MarginNote } from "@/components/research/MarginNote";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";

export default function Home() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-rule pb-8">
          <Label>Research</Label>

          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0">
              <h1 className="font-reading text-4xl leading-tight">
                Rainfall variability and seasonal onset
              </h1>

              <p className="mt-3 max-w-2xl font-ui text-sm leading-relaxed text-muted">
                Research workspace · 3 documents
              </p>
            </div>

            <Button>New query</Button>
          </div>
        </header>

        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,68ch)_280px] lg:justify-center">
          <section className="min-w-0">
            <div className="mb-5">
              <Label>Question</Label>

              <p className="mt-2 font-mono text-xs leading-relaxed text-muted">
                How does rainfall onset vary across the study region?
              </p>
            </div>

            <Answer>
              <p>
                Rainfall onset varies across the study region, with the
                transition into the wet season occurring earlier in some areas
                and later in others. The spatial differences are associated with
                changes in seasonal rainfall patterns and atmospheric
                circulation.
                <Citation
                  index={1}
                  sourceName="Rainfall Study · p. 7"
                  retrievedDate="10 Aug 2026"
                  excerpt="The study identifies substantial spatial differences in rainfall onset across the region."
                />
              </p>

              <p className="mt-6">
                The analysis also indicates that onset dates are not constant
                from year to year. Instead, substantial interannual variation
                occurs throughout the observation period.
                <Citation
                  index={2}
                  sourceName="Climate Analysis · p. 12"
                  retrievedDate="10 Aug 2026"
                  excerpt="Interannual variability was observed throughout the study period."
                />
              </p>
            </Answer>

            <div className="mt-12 border-t border-rule pt-6">
              <Label htmlFor="query">Ask another question</Label>

              <Textarea
                id="query"
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
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
