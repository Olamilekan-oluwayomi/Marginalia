"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type GoogleSignInProps = {
  error?: string;
};

export function GoogleSignIn({ error }: GoogleSignInProps) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const message =
    error === "oauth_failed" || failed
      ? "We couldn't sign you in with Google. Please try again."
      : null;

  async function handleSignIn() {
    if (pending) {
      return;
    }

    setPending(true);
    setFailed(false);

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
