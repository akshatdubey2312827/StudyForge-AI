import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Clock,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/generate",  label: "Generate",  icon: Zap },
  { to: "/history",   label: "History",   icon: Clock },
  { to: "/billing",   label: "Billing",   icon: CreditCard },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const { credits } = useCredits();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <aside className="sidebar flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors duration-150 print:hidden">
      {/* Logo */}
      <Link
        to="/dashboard"
        className="flex items-center gap-2.5 px-5 py-5 text-lg font-bold text-slate-900 dark:text-white"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 shadow-md shadow-brand-200 dark:shadow-none">
          <BookOpen size={16} className="text-white" />
        </span>
        StudyForge AI
      </Link>

      {/* Credit pill */}
      <div className="mx-4 mb-4 flex items-center justify-between rounded-xl bg-brand-50 dark:bg-brand-950/60 border border-brand-100 dark:border-brand-900/60 px-3 py-2.5">
        <span className="text-xs font-medium text-brand-700 dark:text-brand-300">Credits</span>
        <span className="text-sm font-bold text-brand-700 dark:text-brand-300">
          {credits ? credits.balance : "—"}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-50 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300 dark:border dark:border-brand-800/40"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-800 dark:hover:text-slate-100",
              )
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User & Theme Toggle */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <div className="flex items-center gap-2.5 rounded-xl p-2">
          <img
            src={user?.avatar_url}
            alt={user?.name}
            className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 ring-2 ring-slate-200 dark:ring-slate-700"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{user?.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
          </div>
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-amber-300 transition-colors cursor-pointer"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-400 transition-colors cursor-pointer"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
