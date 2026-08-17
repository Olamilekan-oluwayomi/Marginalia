"use client";

import { Suspense, lazy } from "react";
import { UserRound } from "lucide-react";

const AccountMenu = lazy(
  () =>
    import("@/components/layout/AccountMenu").then((m) => ({
      default: m.AccountMenu,
    })),
);

function AccountMenuFallback() {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 items-center justify-center rounded-md text-muted"
    >
      <UserRound size={18} strokeWidth={1.7} />
    </span>
  );
}

export function ClientAccountMenu() {
  return (
    <Suspense fallback={<AccountMenuFallback />}>
      <AccountMenu />
    </Suspense>
  );
}
