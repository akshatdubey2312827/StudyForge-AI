/** Generic async delay */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Format ISO date string to readable format */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Combine class names (tiny clsx substitute) */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Capitalize first letter */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Map difficulty to a high-contrast theme color variant */
export function difficultyColor(d: string): string {
  switch (d) {
    case "easy":
      return "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/70 dark:border-emerald-800/80 font-medium";
    case "medium":
      return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/70 dark:border-amber-800/80 font-medium";
    case "hard":
      return "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/70 dark:border-rose-800/80 font-medium";
    default:
      return "text-slate-700 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700 font-medium";
  }
}

/** Map priority to a high-contrast theme color variant */
export function priorityColor(p: string): string {
  switch (p) {
    case "high":
      return "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/70 dark:border-rose-800/80 font-semibold";
    case "medium":
      return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/70 dark:border-amber-800/80 font-semibold";
    case "low":
      return "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/70 dark:border-emerald-800/80 font-semibold";
    default:
      return "text-slate-700 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700 font-semibold";
  }
}
