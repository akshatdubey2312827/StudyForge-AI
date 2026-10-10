import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { AppLayout } from "@/components/common/AppLayout";
import { CreditProvider } from "@/context/CreditContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { PrintProvider } from "@/context/PrintContext";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { GeneratorPage } from "@/pages/GeneratorPage";
import { NotePage } from "@/pages/NotePage";
import { RevisionPage } from "@/pages/RevisionPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { BillingPage } from "@/pages/BillingPage";

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "generate", element: <GeneratorPage /> },
      { path: "notes/:noteId", element: <NotePage /> },
      { path: "revision/:noteId", element: <RevisionPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "billing", element: <BillingPage /> },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/dashboard" replace />,
  },
]);

export function App() {
  return (
    <ThemeProvider>
      <PrintProvider>
        <AuthProvider>
          <CreditProvider>
            <RouterProvider router={router} />
          </CreditProvider>
        </AuthProvider>
      </PrintProvider>
    </ThemeProvider>
  );
}
