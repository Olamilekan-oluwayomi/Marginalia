import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Greeting } from "@/components/profile/Greeting";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { RecentResearchSection } from "@/components/home/RecentResearchSection";
import { RecentDocumentsSection } from "@/components/home/RecentDocumentsSection";
import { ResearchSectionSkeleton } from "@/components/home/ResearchSectionSkeleton";
import { DocumentsSectionSkeleton } from "@/components/home/DocumentsSectionSkeleton";

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export const metadata: Metadata = {
  title: "Workspace",
  description: "Continue your research or start something new in Marginalia.",
};

export default async function Home() {
  const fallbackGreeting = greetingForHour(new Date().getHours());

  return (
    <AppShell title="Workspace">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-rule pb-8">
          <Label>Workspace</Label>

          <h1 className="mt-3 font-reading text-4xl leading-tight">
            <Greeting fallbackGreeting={fallbackGreeting} />
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

        <Suspense fallback={<ResearchSectionSkeleton />}>
          <RecentResearchSection />
        </Suspense>

        <Suspense fallback={<DocumentsSectionSkeleton />}>
          <RecentDocumentsSection />
        </Suspense>

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
