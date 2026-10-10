import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getCreditBalance } from "@/api/billing";
import { useAuth } from "@/hooks/useAuth";
import type { CreditBalance } from "@/types";

export interface CreditContextType {
  credits: CreditBalance | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CreditContext = createContext<CreditContextType | undefined>(undefined);

export function CreditProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCredits = useCallback(async () => {
    if (!isAuthenticated) {
      setCredits(null);
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsLoading(true);
    setError(null);

    try {
      const data = await getCreditBalance();
      setCredits(data);
    } catch (e: any) {
      if (e?.name !== "CanceledError" && e?.name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Failed to load credits");
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCredits();
    } else {
      setCredits(null);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [isAuthenticated, fetchCredits]);

  // Always refetch credits on browser history navigation (back/forward) or bfcache restore
  useEffect(() => {
    const handleBrowserNavigation = () => {
      if (isAuthenticated) {
        fetchCredits();
      }
    };

    window.addEventListener("popstate", handleBrowserNavigation);
    window.addEventListener("pageshow", handleBrowserNavigation);

    return () => {
      window.removeEventListener("popstate", handleBrowserNavigation);
      window.removeEventListener("pageshow", handleBrowserNavigation);
    };
  }, [isAuthenticated, fetchCredits]);

  return (
    <CreditContext.Provider value={{ credits, isLoading, error, refresh: fetchCredits }}>
      {children}
    </CreditContext.Provider>
  );
}

export function useCredits(): CreditContextType {
  const context = useContext(CreditContext);
  if (!context) {
    throw new Error("useCredits must be used within a CreditProvider");
  }
  return context;
}
