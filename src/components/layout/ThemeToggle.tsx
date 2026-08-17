"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";

const themeIcons = {
  system: Monitor,
  light: Sun,
  dark: Moon,
} as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const ThemeIcon = themeIcons[theme];
  const next =
    theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const themeLabel = `Theme: ${theme}. Switch to ${next}.`;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={themeLabel}
      title={themeLabel}
      className="flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper-raised hover:text-ink"
    >
      <ThemeIcon size={17} strokeWidth={1.7} />
    </button>
  );
}
