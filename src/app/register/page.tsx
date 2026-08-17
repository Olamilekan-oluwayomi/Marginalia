import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Label } from "@/components/ui/Label";
import { getCurrentUser } from "@/lib/auth/get-user";

export const metadata: Metadata = {
  title: "Create your research workspace",
  robots: { index: false, follow: false },
};

type RegisterPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;

  if (await getCurrentUser()) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col bg-paper px-6 py-12 text-ink sm:py-16">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <p className="font-ui text-sm font-medium text-ink">Marginalia</p>
        <p className="mt-0.5 font-ui text-xs text-muted">Research, read, connect.</p>

        <div className="mt-10 rounded-md border border-rule bg-paper-raised px-6 py-8 sm:px-8 sm:py-10">
          <Label>Registration</Label>

          <h1 className="mt-3 font-reading text-3xl leading-tight text-ink">
            Create your research workspace
          </h1>

          <p className="mt-3 font-ui text-sm leading-relaxed text-muted">
            Build a private space for reading, organizing, and exploring your sources.
          </p>

          <GoogleSignIn source="register" error={params.error} />

          <RegisterForm />
        </div>
      </div>
    </main>
  );
}
