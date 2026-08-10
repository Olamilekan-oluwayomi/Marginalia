"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";

const STORAGE_KEY = "research-assistant-name";
const DEFAULT_NAME = "Olamilekan";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function getName(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored?.trim() || DEFAULT_NAME;
  } catch {
    // Storage unavailable (private mode, disabled cookies) — use the default.
    return DEFAULT_NAME;
  }
}

type ProfileContextValue = {
  name: string;
  setName: (name: string) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const name = useSyncExternalStore(subscribe, getName, () => DEFAULT_NAME);

  const setName = useCallback((next: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — the name applies for this session only.
    }
    notifyListeners();
  }, []);

  return (
    <ProfileContext.Provider value={{ name, setName }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);

  if (!context) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }

  return context;
}
