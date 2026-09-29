"use client";

import { useLayoutEffect, useRef, useState } from "react";
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

type Position = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function measureActive(bar: HTMLElement | null): Position | null {
  if (!bar) return null;
  const active = bar.querySelector<HTMLElement>('[aria-current="page"]');
  if (!active) return null;
  const barRect = bar.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  return {
    x: activeRect.left - barRect.left,
    y: activeRect.top - barRect.top,
    width: activeRect.width,
    height: activeRect.height,
  };
}

type RailProps = {
  barRef: React.RefObject<HTMLDivElement | null>;
  className: string;
  position: Position | null;
  children: React.ReactNode;
};

function Rails({ barRef, className, position, children }: RailProps) {
  return (
    <div ref={barRef} className={`relative ${className}`}>
      {position && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-0 rounded-md bg-paper-raised transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{
            width: position.width,
            height: position.height,
            transform: `translate(${position.x}px, ${position.y}px)`,
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function useActivePosition(
  barRef: React.RefObject<HTMLDivElement | null>,
  pathname: string,
) {
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    const update = () => setPosition(measureActive(barRef.current));
    update();

    const bar = barRef.current;
    const observer = bar ? new ResizeObserver(update) : null;
    if (bar) observer?.observe(bar);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [barRef, pathname]);

  return position;
}

export function SlidingNav() {
  const pathname = usePathname();
  const desktopRef = useRef<HTMLDivElement | null>(null);
  const mobileRef = useRef<HTMLDivElement | null>(null);
  const desktopPos = useActivePosition(desktopRef, pathname);
  const mobilePos = useActivePosition(mobileRef, pathname);

  const items = navigation.map((item) => {
    const Icon = item.icon;
    const active =
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return { ...item, Icon, active };
  });

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-14 flex-col border-r border-rule bg-paper md:flex">
        <Rails
          barRef={desktopRef}
          className="flex flex-1 flex-col items-center gap-2 py-4"
          position={desktopPos}
        >
          {items.map(({ label, Icon, href, active }) => (
            <Link
              key={label}
              href={href}
              title={label}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper-raised/60 hover:text-ink [&[aria-current='page']]:text-pine"
            >
              <Icon size={17} strokeWidth={1.7} />
            </Link>
          ))}
        </Rails>

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

      <Rails
        barRef={mobileRef}
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center border-t border-rule bg-paper md:hidden"
        position={mobilePos}
      >
        {items.map(({ label, Icon, href, active }) => (
          <Link
            key={label}
            href={href}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className="flex h-full flex-1 flex-col items-center justify-center gap-1 text-muted transition-colors hover:bg-paper-raised/50 hover:text-ink [&[aria-current='page']]:text-pine"
          >
            <Icon size={17} strokeWidth={1.7} />

            <span className="whitespace-nowrap font-ui text-[10px]">
              {label}
            </span>
          </Link>
        ))}
      </Rails>
    </>
  );
}
