"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_NAME = "New Researcher";

type ProfileContextValue = {
  name: string;
  email: string;
  loading: boolean;
  setName: (name: string) => Promise<boolean>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<{ userId: string; name: string } | null>(
    null
  );
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    if (lastUserId.current === user.id) {
      return;
    }
    lastUserId.current = user.id;

    let cancelled = false;
    const supabase = createClient();
    const userId = user.id;

    const metadata = user.user_metadata;
    const fallbackName =
      typeof metadata?.display_name === "string" && metadata.display_name.trim()
        ? metadata.display_name.trim()
        : typeof metadata?.name === "string" && metadata.name.trim()
          ? metadata.name.trim()
          : DEFAULT_NAME;

    async function fetchProfile() {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", userId)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        setProfile({
          userId,
          name: data?.display_name?.trim() || fallbackName,
        });
      } catch {
        if (!cancelled) {
          setProfile({ userId, name: fallbackName });
        }
      }
    }

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  const name = profile && user && profile.userId === user.id ? profile.name : "";
  const email = user ? user.email ?? "" : "";

  const setName = useCallback(
    async (next: string): Promise<boolean> => {
      const trimmed = next.trim();
      if (!user || !trimmed) {
        return false;
      }

      const previous = profile?.name ?? null;
      setProfile({ userId: user.id, name: trimmed });

      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", user.id);

      if (error) {
        console.error("Failed to update profile:", error);
        setProfile((current) =>
          current && current.userId === user.id && previous !== null
            ? { userId: user.id, name: previous }
            : current
        );
        return false;
      }

      return true;
    },
    [user, profile?.name]
  );

  return (
    <ProfileContext.Provider value={{ name, email, loading, setName }}>
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
