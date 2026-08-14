import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Label } from "@/components/ui/Label";
import { getCurrentUser } from "@/lib/auth/get-user";

function signInMethodLabel(provider: unknown): string | null {
  if (provider === "email") {
    return "Email";
  }
  if (provider === "google") {
    return "Google";
  }
  return null;
}

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your account and appearance.",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.email ?? "";
  const method = signInMethodLabel(user.app_metadata?.provider);

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-3xl">
        <header className="border-b border-rule pb-8">
          <Label>Settings</Label>

          <h1 className="mt-3 font-reading text-4xl leading-tight">Settings</h1>

          <p className="mt-3 font-ui text-sm text-muted">
            Manage your account and appearance.
          </p>
        </header>

        <div className="divide-y divide-rule">
          <section className="py-10">
            <Label>Account</Label>

            <div className="mt-6">
              <h2 className="font-ui text-sm font-medium text-ink">Profile</h2>

              <p className="mt-1 font-ui text-sm text-muted">
                Your display name and the email tied to this workspace.
              </p>

              <ProfileForm email={email} />

              <dl className="mt-8 space-y-3 border-t border-rule pt-6">
                <div className="flex items-baseline justify-between gap-6">
                  <dt className="font-ui text-sm text-muted">Account status</dt>
                  <dd className="font-ui text-sm text-ink">Authenticated</dd>
                </div>

                {method ? (
                  <div className="flex items-baseline justify-between gap-6">
                    <dt className="font-ui text-sm text-muted">Sign-in method</dt>
                    <dd className="font-ui text-sm text-ink">{method}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </section>

          <section className="py-10">
            <Label>Appearance</Label>

            <div className="mt-6">
              <h2 className="font-ui text-sm font-medium text-ink">Theme</h2>

              <p className="mt-1 font-ui text-sm text-muted">
                Choose how Marginalia looks on your device.
              </p>

              <div className="mt-4">
                <ThemeToggle />
              </div>
            </div>
          </section>

          <section className="py-10">
            <Label>Session</Label>

            <div className="mt-6">
              <h2 className="font-ui text-sm font-medium text-ink">
                Sign out of this workspace
              </h2>

              <p className="mt-1 font-ui text-sm text-muted">
                You are signed in as{" "}
                <span className="font-medium text-ink">{email}</span>.
              </p>

              <div className="mt-4">
                <LogoutButton />
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
