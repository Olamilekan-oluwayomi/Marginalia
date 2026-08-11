"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Settings, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useProfile } from "@/components/profile/ProfileProvider";

export function AccountMenu() {
  const { user, loading } = useAuth();
  const { name } = useProfile();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (loading) {
    return (
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted"
      >
        <UserRound size={18} strokeWidth={1.7} />
      </span>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex h-9 items-center gap-2 rounded-md px-2 font-ui text-sm text-muted transition-colors hover:bg-paper-raised hover:text-ink"
      >
        <UserRound size={18} strokeWidth={1.7} />
        <span className="hidden md:block">Sign in</span>
      </Link>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 items-center gap-1.5 rounded-md px-2 text-muted transition-colors hover:bg-paper-raised hover:text-ink"
      >
        <UserRound size={18} strokeWidth={1.7} />
        <span className="hidden max-w-36 truncate font-ui text-sm text-ink md:block">
          {name}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-2 w-52 rounded-md border border-rule bg-paper-raised py-1"
        >
          <p className="truncate border-b border-rule px-4 py-2.5 font-ui text-sm text-ink">
            {name}
          </p>

          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 font-ui text-sm text-ink transition-colors hover:bg-paper"
          >
            <Settings size={16} strokeWidth={1.7} />
            Settings
          </Link>

          <LogoutButton variant="menu" />
        </div>
      ) : null}
    </div>
  );
}
