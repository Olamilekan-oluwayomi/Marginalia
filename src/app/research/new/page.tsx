import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { CreateResearchForm } from "@/components/research/CreateResearchForm";
import { Label } from "@/components/ui/Label";

export const metadata: Metadata = {
  title: "New research",
  description: "Start a research workspace for a question you're trying to answer.",
};

export default function NewResearchPage() {
  return (
    <AppShell title="New research">
      <div className="mx-auto max-w-3xl">
        <header className="border-b border-rule pb-8">
          <Label>New research</Label>

          <h1 className="mt-3 font-reading text-4xl leading-tight">
            Start a research workspace
          </h1>

          <p className="mt-3 font-ui text-sm text-muted">
            Give your workspace a name, then describe the question you&rsquo;re
            trying to answer.
          </p>
        </header>

        <div className="pt-8">
          <CreateResearchForm />
        </div>
      </div>
    </AppShell>
  );
}
