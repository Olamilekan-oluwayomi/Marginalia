"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type FieldName = "displayName" | "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<FieldName, string>>;

const MAX_DISPLAY_NAME_LENGTH = 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_IDS: Record<FieldName, string> = {
  displayName: "display-name",
  email: "email",
  password: "password",
  confirmPassword: "confirm-password",
};

function inputClass(invalid: boolean) {
  return `mt-2 w-full rounded-md border bg-paper-raised px-4 py-3 font-ui text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-pine ${
    invalid ? "border-error" : "border-rule"
  }`;
}

export function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">(
    "idle",
  );

  function validate(): FieldErrors {
    const next: FieldErrors = {};

    const name = displayName.trim();
    if (!name) {
      next.displayName = "Please enter your name.";
    } else if (name.length > MAX_DISPLAY_NAME_LENGTH) {
      next.displayName = `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      next.email = "Please enter your email address.";
    } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
      next.email = "Please enter a valid email address.";
    }

    if (!password) {
      next.password = "Please enter a password.";
    } else if (password.length < 8) {
      next.password = "Password must be at least 8 characters.";
    }

    if (!confirmPassword) {
      next.confirmPassword = "Please confirm your password.";
    } else if (confirmPassword !== password) {
      next.confirmPassword = "Passwords do not match.";
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

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          display_name: displayName.trim(),
        },
      },
    });

    if (error) {
      setStatus("idle");
      setFormError(mapSignupError(error));
      return;
    }

    if (data.session) {
      router.push("/");
      router.refresh();
      return;
    }

    setStatus("success");
  }

  if (status === "success") {
    return (
      <div className="mt-8">
        <h2 className="font-reading text-2xl leading-tight text-ink">
          Check your email
        </h2>

        <p className="mt-3 font-ui text-sm leading-relaxed text-muted">
          Your account has been created. Confirm your email address to continue.
        </p>

        <p className="mt-2 font-ui text-sm leading-relaxed text-muted">
          We sent a confirmation link to your email address.
        </p>

        <div className="mt-6">
          <Link
            href="/login"
            className="font-ui text-sm font-medium text-pine transition-colors hover:text-pine-dim"
          >
            Return to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-6">
      <div>
        <label
          htmlFor={FIELD_IDS.displayName}
          className="font-ui text-sm font-medium text-ink"
        >
          Display name
        </label>
        <input
          id={FIELD_IDS.displayName}
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={
            errors.displayName ? `${FIELD_IDS.displayName}-error` : undefined
          }
          className={inputClass(Boolean(errors.displayName))}
        />
        {errors.displayName ? (
          <p
            id={`${FIELD_IDS.displayName}-error`}
            className="mt-2 font-ui text-xs text-error"
          >
            {errors.displayName}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor={FIELD_IDS.email}
          className="font-ui text-sm font-medium text-ink"
        >
          Email
        </label>
        <input
          id={FIELD_IDS.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={
            errors.email ? `${FIELD_IDS.email}-error` : undefined
          }
          className={inputClass(Boolean(errors.email))}
        />
        {errors.email ? (
          <p
            id={`${FIELD_IDS.email}-error`}
            className="mt-2 font-ui text-xs text-error"
          >
            {errors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor={FIELD_IDS.password}
          className="font-ui text-sm font-medium text-ink"
        >
          Password
        </label>
        <input
          id={FIELD_IDS.password}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={
            errors.password ? `${FIELD_IDS.password}-error` : undefined
          }
          className={inputClass(Boolean(errors.password))}
        />
        {errors.password ? (
          <p
            id={`${FIELD_IDS.password}-error`}
            className="mt-2 font-ui text-xs text-error"
          >
            {errors.password}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor={FIELD_IDS.confirmPassword}
          className="font-ui text-sm font-medium text-ink"
        >
          Confirm password
        </label>
        <input
          id={FIELD_IDS.confirmPassword}
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          aria-invalid={Boolean(errors.confirmPassword)}
          aria-describedby={
            errors.confirmPassword
              ? `${FIELD_IDS.confirmPassword}-error`
              : undefined
          }
          className={inputClass(Boolean(errors.confirmPassword))}
        />
        {errors.confirmPassword ? (
          <p
            id={`${FIELD_IDS.confirmPassword}-error`}
            className="mt-2 font-ui text-xs text-error"
          >
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="font-ui text-sm text-error">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Creating workspace..." : "Create account"}
      </Button>

      <p className="font-ui text-sm text-muted">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-pine transition-colors hover:text-pine-dim"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

function mapSignupError(error: {
  message?: string;
  hint?: string | null;
  status?: number;
}): string {
  const message = error.message ?? "";
  const hint = error.hint ?? "";

  if (/already registered/i.test(message) || /already registered/i.test(hint)) {
    return "That email address is already registered. Try signing in instead.";
  }

  // Matches both phrasings GoTrue uses when the Supabase project disallows
  // new signups: "Signups are disabled" and "Signup not allowed for this
  // instance".
  if (/signups?\s+(are\s+)?disabled|signup.*not allowed/i.test(message)) {
    return "Registration is currently unavailable. Please try again later.";
  }

  if (/password/i.test(message) || /password/i.test(hint)) {
    return "Your password does not meet the minimum requirements.";
  }

  if (/rate limit|too many requests/i.test(message)) {
    return "Too many attempts. Please try again in a moment.";
  }

  return "We couldn't create your account. Please try again.";
}
