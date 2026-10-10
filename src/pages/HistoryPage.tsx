import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { listNotes } from "@/api/notes";
import type { Difficulty, NoteSummary } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Spinner } from "@/components/common/Spinner";
import { capitalize, cn, difficultyColor, formatDate } from "@/lib/utils";

const ALL = "all" as const;
type Filter = Difficulty | typeof ALL;

export function HistoryPage() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(ALL);

  useEffect(() => {
    listNotes(1, 100)
      .then((r) => setNotes(r.notes))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = notes.filter((n) => {
    const matchSearch = n.topic.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === ALL || n.difficulty === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">History</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          All your generated notes
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          />
          <input
            type="text"
            placeholder="Search by topic…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-950 transition-colors"
          />
        </div>
        <div className="flex gap-1.5">
          {([ALL, "easy", "medium", "hard"] as Filter[]).map((d) => (
            <button
              key={d}
              onClick={() => setFilter(d)}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs font-semibold transition-all",
                filter === d
                  ? d === ALL
                    ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/60 dark:text-brand-300"
                    : difficultyColor(d)
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100",
              )}
            >
              {d === ALL ? "All" : capitalize(d)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-24">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-slate-500 dark:text-slate-400">
            {search || filter !== ALL ? "No notes match your filters." : "No notes yet. Generate your first!"}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {filtered.map((note) => (
            <Link
              key={note.id}
              to={`/notes/${note.id}`}
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 group"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 group-hover:text-slate-900 dark:text-slate-200 dark:group-hover:text-slate-100">
                  {note.topic}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(note.created_at)}
                </p>
              </div>
              <Badge
                label={capitalize(note.difficulty)}
                className={cn("shrink-0", difficultyColor(note.difficulty))}
              />
              <span className="text-xs font-medium text-slate-400 group-hover:text-brand-600 dark:text-slate-500 dark:group-hover:text-brand-400">
                View →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
