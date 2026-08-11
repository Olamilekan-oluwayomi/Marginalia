"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type LogoutButtonProps = {
  variant?: "secondary" | "menu";
};

export function LogoutButton({ variant = "secondary" }: LogoutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      console.error("Sign out failed:", signOutError);
      setPending(false);
      setError("Unable to sign out. Please try again.");
      return;
    }

    router.push("/login");
    router.refresh();
  }

  const className =
    variant === "menu"
      ? "flex w-full items-center gap-2.5 px-4 py-2.5 font-ui text-sm text-ink transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
      : "rounded-md border border-rule bg-paper-raised px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-pine active:bg-paper disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={handleSignOut}
        role={variant === "menu" ? "menuitem" : undefined}
        className={className}
      >
        {variant === "menu" ? <LogOut size={16} strokeWidth={1.7} /> : null}
        {pending ? "Signing out..." : "Sign out"}
      </button>

      {error ? (
        <p
          role="alert"
          className={
            variant === "menu"
              ? "px-4 pb-2 pt-1 font-ui text-xs text-error"
              : "mt-3 font-ui text-sm text-error"
          }
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
