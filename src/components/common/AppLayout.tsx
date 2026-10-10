import { useEffect } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { Sidebar } from "@/components/common/Sidebar";
import { Spinner } from "@/components/common/Spinner";

export function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const { refresh: refreshCredits } = useCredits();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      refreshCredits();
    }
  }, [location.pathname, location.search, isAuthenticated, refreshCredits]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-layout flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 print:h-auto print:overflow-visible print:bg-white print:block">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors duration-150 print:h-auto print:overflow-visible print:bg-white print:block">
        <Outlet />
      </main>
    </div>
  );
}
