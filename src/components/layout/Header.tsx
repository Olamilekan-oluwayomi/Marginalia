import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { ClientAccountMenu } from "./ClientAccountMenu";

type HeaderProps = {
  title?: string;
  showTitle?: boolean;
};

export function Header({ title, showTitle = true }: HeaderProps) {
  return (
    <header className="relative sticky top-0 z-30 flex h-14 items-center border-b border-rule bg-paper">
      <div className="flex min-w-0 flex-1 pl-5 sm:pl-8">
        <Link href="/" className="group flex shrink-0 flex-col justify-center">
          <span className="font-ui text-sm font-medium text-ink transition-colors group-hover:text-pine-dim">
            Marginalia
          </span>
          <span className="font-ui text-xs text-muted">
            Research, read, connect.
          </span>
        </Link>
      </div>

      {showTitle && title ? (
        <span className="pointer-events-none absolute left-1/2 top-1/2 hidden max-w-[40%] -translate-x-1/2 -translate-y-1/2 truncate font-ui text-sm text-muted sm:block">
          {title}
        </span>
      ) : null}

      <div className="flex shrink-0 items-center gap-1 pr-5 sm:pr-8">
        <ThemeToggle />
        <ClientAccountMenu />
      </div>
    </header>
  );
}
