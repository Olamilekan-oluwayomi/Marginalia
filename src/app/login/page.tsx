import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { LoginForm } from "@/components/auth/LoginForm";
import { Label } from "@/components/ui/Label";
import { getCurrentUser } from "@/lib/auth/get-user";
import { resolveInternalPath } from "@/lib/auth/internal-path";

export const metadata: Metadata = {
  title: "Sign in to your research workspace",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  if (await getCurrentUser()) {
    redirect("/");
  }

  const redirectTo = resolveInternalPath(params.redirectTo);

  return (
    <main className="flex min-h-screen flex-col bg-paper px-6 py-12 text-ink sm:py-16">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <p className="font-ui text-sm font-medium text-ink">Marginalia</p>
        <p className="mt-0.5 font-ui text-xs text-muted">Research, read, connect.</p>

        <div className="mt-10 rounded-md border border-rule bg-paper-raised px-6 py-8 sm:px-8 sm:py-10">
          <Label>Sign in</Label>

          <h1 className="mt-3 font-reading text-3xl leading-tight text-ink">
            Welcome back
          </h1>

          <p className="mt-3 font-ui text-sm leading-relaxed text-muted">
            Return to your research workspace.
          </p>

          <GoogleSignIn source="login" error={params.error} redirectTo={redirectTo} />

          <LoginForm redirectTo={redirectTo} />
        </div>
      </div>
    </main>
  );
}
