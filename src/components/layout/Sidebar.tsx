"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText, Plus, Settings, UserRound } from "lucide-react";

const navigation = [
  {
    label: "New research",
    icon: Plus,
    href: "/",
  },
  {
    label: "Research",
    icon: BookOpen,
    href: "/research",
  },
  {
    label: "Documents",
    icon: FileText,
    href: "/documents",
  },
  {
    label: "Settings",
    icon: Settings,
    href: "/settings",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";

    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-14 flex-col border-r border-rule bg-paper md:flex">
        <nav className="flex flex-1 flex-col items-center gap-2 py-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.label}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                  active
                    ? "bg-paper-raised text-pine"
                    : "text-muted hover:bg-paper-raised hover:text-ink"
                }`}
              >
                <Icon size={17} strokeWidth={1.7} />
              </Link>
            );
          })}
        </nav>

        <div className="flex justify-center border-t border-rule py-4">
          <Link
            href="/settings"
            title="Profile"
            aria-label="Profile"
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-paper-raised hover:text-ink"
          >
            <UserRound size={17} strokeWidth={1.7} />
          </Link>
        </div>
      </aside>

      {/* Mobile navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-rule bg-paper md:hidden">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-1 transition-colors ${
                active ? "bg-paper-raised text-pine" : "text-muted"
              }`}
            >
              <Icon size={17} strokeWidth={1.7} />

              <span className="whitespace-nowrap font-ui text-[10px]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
