import { BookOpen, FileText, Plus, Settings, UserRound } from "lucide-react";
import { ActiveLink } from "./ActiveLink";

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
  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-14 flex-col border-r border-rule bg-paper md:flex">
        <nav
          aria-label="Primary"
          className="flex flex-1 flex-col items-center gap-2 py-4"
        >
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <ActiveLink
                key={item.label}
                href={item.href}
                label={item.label}
                className="flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper-raised hover:text-ink [[aria-current='page']]:bg-paper-raised [[aria-current='page']]:text-pine"
              >
                <Icon size={17} strokeWidth={1.7} />
              </ActiveLink>
            );
          })}
        </nav>

        <div className="flex justify-center border-t border-rule py-4">
          <ActiveLink
            href="/settings"
            label="Profile"
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-paper-raised hover:text-ink"
          >
            <UserRound size={17} strokeWidth={1.7} />
          </ActiveLink>
        </div>
      </aside>

      {/* Mobile navigation */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-rule bg-paper md:hidden"
      >
        {navigation.map((item) => {
          const Icon = item.icon;

          return (
            <ActiveLink
              key={item.label}
              href={item.href}
              label={item.label}
              className="flex flex-1 flex-col items-center justify-center gap-1 text-muted transition-colors [[aria-current='page']]:bg-paper-raised [[aria-current='page']]:text-pine"
            >
              <Icon size={17} strokeWidth={1.7} />

              <span className="whitespace-nowrap font-ui text-[10px]">
                {item.label}
              </span>
            </ActiveLink>
          );
        })}
      </nav>
    </>
  );
}
