"use client";

import { useProfile } from "./ProfileProvider";

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export function Greeting() {
  const { name } = useProfile();
  const greeting = greetingForHour(new Date().getHours());
  const label = name ? `${greeting}, ${name}` : greeting;

  // The greeting depends on the visitor's local time, which the server can't
  // know — suppressHydrationWarning lets React adopt the client value without
  // warning about the intentional difference.
  return <span suppressHydrationWarning>{label}</span>;
}
