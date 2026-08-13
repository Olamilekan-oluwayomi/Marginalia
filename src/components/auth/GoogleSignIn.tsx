"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type GoogleSignInProps = {
  source: "register" | "login";
  error?: string;
  redirectTo?: string;
};

export function GoogleSignIn({ source, error, redirectTo }: GoogleSignInProps) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const message =
    error === "account_not_found"
      ? "No account was found for this Google account. Please register first."
      : error === "profile_check_failed"
        ? "We couldn't verify your account just now. Please try signing in again."
        : error === "oauth_failed" || failed
          ? "We couldn't sign you in with Google. Please try again."
          : null;

  async function handleSignIn() {
    if (pending) {
      return;
    }

    setPending(true);
    setFailed(false);

    document.cookie = `oauth_origin=${source}; path=/; samesite=lax; max-age=600`;

    if (redirectTo) {
      document.cookie = `auth_destination=${encodeURIComponent(
        redirectTo
      )}; path=/; samesite=lax; max-age=600`;
    }

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signInError || !data.url) {
      console.error("Google sign-in failed:", signInError);
      setPending(false);
      setFailed(true);
      return;
    }

    window.location.href = data.url;
  }

  return (
    <div className="mt-8">
      {message ? (
        <p role="alert" className="mb-4 font-ui text-sm text-error">
          {message}
        </p>
      ) : null}

      <Button
        type="button"
        variant="google"
        className="w-full"
        disabled={pending}
        onClick={handleSignIn}
      >
        {pending ? "Connecting to Google..." : undefined}
      </Button>

      <div aria-hidden="true" className="mt-8 flex items-center gap-4">
        <span className="h-px flex-1 bg-rule" />
        <span className="font-ui text-xs uppercase tracking-widest text-muted">
          or
        </span>
        <span className="h-px flex-1 bg-rule" />
      </div>
    </div>
  );
}
