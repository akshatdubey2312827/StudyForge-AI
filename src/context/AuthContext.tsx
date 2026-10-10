import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getSession, logout as apiLogout } from "@/api/auth";
import type { AuthSession, User } from "@/types";

interface AuthContextValue {
  user: User | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Force-refresh session from the server (e.g. after OAuth callback lands). */
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, rehydrate from the httpOnly cookie via GET /api/auth/session.
  // The 401 interceptor in client.ts will attempt one token refresh automatically
  // if the access_token cookie is expired but the refresh_token is still valid.
  useEffect(() => {
    getSession()
      .then((s) => {
        if (s) setSession(s);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const refreshSession = useCallback(async () => {
    const s = await getSession();
    setSession(s ?? null);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        isLoading,
        isAuthenticated: !!session,
        refreshSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
