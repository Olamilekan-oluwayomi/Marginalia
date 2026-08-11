"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useProfile } from "./ProfileProvider";
import { Button } from "@/components/ui/Button";

const MAX_DISPLAY_NAME_LENGTH = 60;
const NAME_FIELD_ID = "display-name";

type ProfileFormProps = {
  email: string;
};

function inputClass(invalid: boolean, readOnly = false) {
  return `mt-2 w-full rounded-md border bg-paper-raised px-4 py-3 font-ui text-sm outline-none transition-colors focus:border-pine ${
    invalid ? "border-error" : "border-rule"
  } ${readOnly ? "text-muted" : "text-ink"}`;
}

export function ProfileForm({ email }: ProfileFormProps) {
  const { name, loading, setName } = useProfile();
  const [draft, setDraft] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const value = draft ?? name;

  useEffect(() => {
    if (status !== "saved") {
      return;
    }

    const timer = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);

  function validate(next: string): string | null {
    const trimmed = next.trim();

    if (!trimmed) {
      return "Display name is required.";
    }

    if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
      return `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`;
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status === "saving") {
      return;
    }

    const nextError = validate(value);
    setFieldError(nextError);
    setSaveError(null);

    if (nextError) {
      document.getElementById(NAME_FIELD_ID)?.focus();
      return;
    }

    setStatus("saving");
    const saved = await setName(value);

    if (saved) {
      setDraft(null);
      setStatus("saved");
    } else {
      setStatus("idle");
      setSaveError("Unable to save your changes. Please try again.");
    }
  }

  const buttonLabel =
    status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Save changes";

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-6">
      <div className="grid gap-6">
        <div>
          <label
            htmlFor={NAME_FIELD_ID}
            className="font-ui text-sm font-medium text-ink"
          >
            Display name
          </label>

          <input
            id={NAME_FIELD_ID}
            type="text"
            autoComplete="name"
            value={value}
            disabled={loading}
            onChange={(event) => setDraft(event.target.value)}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? `${NAME_FIELD_ID}-error` : undefined}
            className={inputClass(Boolean(fieldError))}
          />

          {fieldError ? (
            <p
              id={`${NAME_FIELD_ID}-error`}
              className="mt-2 font-ui text-xs text-error"
            >
              {fieldError}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="profile-email"
            className="font-ui text-sm font-medium text-ink"
          >
            Email
          </label>

          <input
            id="profile-email"
            type="email"
            value={email}
            readOnly
            disabled={loading}
            className={inputClass(false, true)}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <Button type="submit" disabled={status === "saving" || loading}>
          {buttonLabel}
        </Button>

        <span role="status" className="sr-only">
          {status === "saved" ? "Changes saved." : ""}
        </span>
      </div>

      {saveError ? (
        <p role="alert" className="mt-4 font-ui text-sm text-error">
          {saveError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 font-ui text-sm text-muted">Loading your profile…</p>
      ) : null}
    </form>
  );
}
