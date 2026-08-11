"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type FieldName = "email" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_IDS: Record<FieldName, string> = {
  email: "email",
  password: "password",
};

function inputClass(invalid: boolean) {
  return `mt-2 w-full rounded-md border bg-paper-raised px-4 py-3 font-ui text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-pine ${
    invalid ? "border-error" : "border-rule"
  }`;
}

export function LoginForm({ redirectTo = "/" }: { redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");

  function validate(): FieldErrors {
    const next: FieldErrors = {};

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      next.email = "Please enter your email address.";
    } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
      next.email = "Please enter a valid email address.";
    }

    if (!password) {
      next.password = "Please enter your password.";
    }

    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status === "submitting") {
      return;
    }

    setFormError(null);
    const nextErrors = validate();
    setErrors(nextErrors);

    const firstInvalid = (Object.keys(nextErrors) as FieldName[])[0];
    if (firstInvalid) {
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }

    const supabase = createClient();
    setStatus("submitting");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setStatus("idle");
      setFormError(mapLoginError(error));
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-6">
      <div>
        <label htmlFor={FIELD_IDS.email} className="font-ui text-sm font-medium text-ink">
          Email
        </label>
        <input
          id={FIELD_IDS.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? `${FIELD_IDS.email}-error` : undefined}
          className={inputClass(Boolean(errors.email))}
        />
        {errors.email ? (
          <p id={`${FIELD_IDS.email}-error`} className="mt-2 font-ui text-xs text-error">
            {errors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor={FIELD_IDS.password} className="font-ui text-sm font-medium text-ink">
          Password
        </label>
        <input
          id={FIELD_IDS.password}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? `${FIELD_IDS.password}-error` : undefined}
          className={inputClass(Boolean(errors.password))}
        />
        {errors.password ? (
          <p id={`${FIELD_IDS.password}-error`} className="mt-2 font-ui text-xs text-error">
            {errors.password}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="font-ui text-sm text-error">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Signing in..." : "Sign in"}
      </Button>

      <p className="font-ui text-sm text-muted">
        <Link
          href="/forgot-password"
          className="font-medium text-pine transition-colors hover:text-pine-dim"
        >
          Forgot your password?
        </Link>
      </p>

      <p className="font-ui text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-pine transition-colors hover:text-pine-dim"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}

function mapLoginError(error: {
  message?: string;
  code?: string;
  hint?: string | null;
}): string {
  const message = error.message ?? "";
  const code = error.code ?? "";
  const hint = error.hint ?? "";

  if (
    code === "invalid_credentials" ||
    /invalid login credentials/i.test(message) ||
    /invalid login credentials/i.test(hint)
  ) {
    return "Email or password is incorrect.";
  }

  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return "Please confirm your email address before signing in.";
  }

  if (
    code === "over_request_rate_limit" ||
    /too many requests|rate limit/i.test(message)
  ) {
    return "Too many sign-in attempts. Please wait a moment and try again.";
  }

  return "We couldn't sign you in. Please try again.";
}
