import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getCreditBalance } from "@/api/billing";
import { getNoteDifficultyCosts } from "@/api/notes";
import { useAuth } from "@/hooks/useAuth";
import { FALLBACK_DIFFICULTY_COST, type CreditBalance, type Difficulty } from "@/types";

export interface CreditContextType {
  credits: CreditBalance | null;
  costs: Record<Difficulty, number>;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getCostForDifficulty: (difficulty: Difficulty) => number;
}

const CreditContext = createContext<CreditContextType | undefined>(undefined);

export function CreditProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [costs, setCosts] = useState<Record<Difficulty, number>>(FALLBACK_DIFFICULTY_COST);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch costs once from backend (cached single source of truth)
  useEffect(() => {
    let mounted = true;
    getNoteDifficultyCosts()
      .then((data) => {
        if (mounted && data) {
          setCosts({
            easy: data.easy ?? FALLBACK_DIFFICULTY_COST.easy,
            medium: data.medium ?? FALLBACK_DIFFICULTY_COST.medium,
            hard: data.hard ?? FALLBACK_DIFFICULTY_COST.hard,
          });
        }
      })
      .catch((err) => {
        console.warn("[CreditContext] Failed to fetch dynamic costs, using fallback:", err);
      });
    return () => {
      mounted = false;
    };
  }, []);

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

  const getCostForDifficulty = useCallback(
    (difficulty: Difficulty): number => {
      return costs[difficulty] ?? FALLBACK_DIFFICULTY_COST[difficulty] ?? 2;
    },
    [costs],
  );

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
    <CreditContext.Provider
      value={{
        credits,
        costs,
        isLoading,
        error,
        refresh: fetchCredits,
        getCostForDifficulty,
      }}
    >
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
