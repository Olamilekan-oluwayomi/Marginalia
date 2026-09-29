"use client";

import { useProfile } from "./ProfileProvider";

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Renders a time-of-day greeting that upgrades with the user's name once
 * the profile loads. `fallbackGreeting` is computed on the server so the
 * LCP element has meaningful text immediately — no client-side data fetch
 * required for the initial paint.
 */
export function Greeting({ fallbackGreeting }: { fallbackGreeting?: string }) {
  const { name, loading } = useProfile();
  const greeting = greetingForHour(new Date().getHours());
  const label =
    loading && fallbackGreeting
      ? fallbackGreeting
      : name
        ? `${greeting}, ${name}`
        : greeting;

  // The greeting depends on the visitor's local time, which the server can't
  // know — suppressHydrationWarning lets React adopt the client value without
  // warning about the intentional difference.
  return <span suppressHydrationWarning>{label}</span>;
}
