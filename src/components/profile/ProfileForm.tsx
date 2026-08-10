"use client";

import { useState } from "react";
import { useProfile } from "./ProfileProvider";
import { Button } from "@/components/ui/Button";

export function ProfileForm() {
  const { name, setName } = useProfile();
  const [draft, setDraft] = useState<string | null>(null);

  const value = draft ?? name;

  const handleSave = () => {
    setName(value.trim());
    setDraft(null);
  };

  return (
    <>
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
            value={value}
            onChange={(event) => setDraft(event.target.value)}
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
        <Button onClick={handleSave}>Save changes</Button>
      </div>
    </>
  );
}
