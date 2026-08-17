"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;

    import("@/lib/supabase/client").then(({ createClient }) => {
      if (!mounted) return;
      const supabase = createClient();

      supabase.auth.getUser().then(({ data }) => {
        if (!mounted) return;
        setUser(data.user ?? null);
        setLoading(false);
      });

      const { data: subscription } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (!mounted) return;
          setUser(event === "SIGNED_OUT" ? null : (session?.user ?? null));
          setLoading(false);
        }
      );

      unsubRef.current = () => subscription.subscription.unsubscribe();
    });

    return () => {
      mounted = false;
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
