import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { ChevronDown } from "lucide-react";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <header className="border-b border-rule pb-8">
          <Label>Preferences</Label>

          <h1 className="mt-3 font-reading text-4xl leading-tight">Settings</h1>

          <p className="mt-3 font-ui text-sm text-muted">
            Manage your account and research preferences.
          </p>
        </header>

        <div className="divide-y divide-rule">
          {/* Profile */}
          <section className="py-10">
            <Label>Profile</Label>

            <div className="mt-6 grid gap-6">
              <div>
                <label
                  htmlFor="name"
                  className="font-ui text-sm font-medium text-ink"
                >
                  Name
                </label>

                <input
                  id="name"
                  type="text"
                  defaultValue="Olamilekan"
                  className="mt-2 w-full rounded-md border border-rule bg-paper-raised px-4 py-3 font-ui text-sm text-ink outline-none transition-colors focus:border-pine"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="font-ui text-sm font-medium text-ink"
                >
                  Email
                </label>

                <input
                  id="email"
                  type="email"
                  defaultValue="researcher@example.com"
                  className="mt-2 w-full rounded-md border border-rule bg-paper-raised px-4 py-3 font-ui text-sm text-ink outline-none transition-colors focus:border-pine"
                />
              </div>
            </div>

            <div className="mt-5">
              <Button>Save changes</Button>
            </div>
          </section>

          {/* Research preferences */}
          <section className="py-10">
            <Label>Research preferences</Label>

            <div className="mt-6 space-y-6">
              <div>
                <h2 className="font-ui text-sm font-medium text-ink">
                  Answer style
                </h2>

                <p className="mt-1 font-ui text-sm text-muted">
                  Choose how detailed your research answers should be.
                </p>

                <div className="relative mt-3 w-full sm:w-fit">
                  <select
                    defaultValue="balanced"
                    className="w-full appearance-none rounded-md border border-rule bg-paper-raised py-3 pl-4 pr-10 font-ui text-sm text-ink outline-none focus:border-pine sm:w-auto"
                  >
                    <option value="concise">Concise</option>
                    <option value="balanced">Balanced</option>
                    <option value="detailed">Detailed</option>
                  </select>

                  <ChevronDown
                    size={16}
                    strokeWidth={1.8}
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
                  />
                </div>
              </div>

              <div>
                <h2 className="font-ui text-sm font-medium text-ink">
                  Citations
                </h2>

                <p className="mt-1 font-ui text-sm text-muted">
                  Always show source references alongside research answers.
                </p>

                <label className="mt-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 accent-pine"
                  />

                  <span className="font-ui text-sm text-ink">
                    Show citations
                  </span>
                </label>
              </div>
            </div>
          </section>

          {/* Account */}
          <section className="py-10">
            <Label>Account</Label>

            <div className="mt-6">
              <h2 className="font-ui text-sm font-medium text-ink">Sign out</h2>

              <p className="mt-1 font-ui text-sm text-muted">
                Sign out of your Research Assistant account on this device.
              </p>

              <div className="mt-4">
                <Button variant="secondary">Sign out</Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
