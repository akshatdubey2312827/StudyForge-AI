import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Clock, Plus, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { listNotes } from "@/api/notes";
import { DIFFICULTY_CREDIT_COST, type Difficulty, type NoteSummary } from "@/types";
import { generateNote } from "@/api/notes";
import { Card, CardHeader, CardTitle } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Spinner } from "@/components/common/Spinner";
import { capitalize, difficultyColor, formatDate, cn } from "@/lib/utils";

const DIFFICULTY_OPTIONS: Difficulty[] = ["easy", "medium", "hard"];

export function DashboardPage() {
  const { user } = useAuth();
  const { credits, isLoading: creditsLoading, refresh: refreshCredits } = useCredits();
  const navigate = useNavigate();

  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [isGenerating, setIsGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [recentNotes, setRecentNotes] = useState<NoteSummary[]>([]);
  const [totalNotes, setTotalNotes] = useState<number>(0);
  const [notesLoading, setNotesLoading] = useState(true);

  useEffect(() => {
    refreshCredits();
    listNotes(1, 5)
      .then((r) => {
        setRecentNotes(r.notes);
        setTotalNotes(r.total);
      })
      .finally(() => setNotesLoading(false));
  }, [refreshCredits]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed) {
      setFormError("Please enter a topic to generate notes.");
      return;
    }
    if (trimmed.length < 3) {
      setFormError("Topic must be at least 3 characters.");
      return;
    }
    if (trimmed.length > 200) {
      setFormError("Topic must be at most 200 characters.");
      return;
    }
    setFormError(null);
    setIsGenerating(true);
    try {
      const { job_id } = await generateNote({ topic: trimmed, difficulty });
      navigate(
        `/generate?job_id=${job_id}&topic=${encodeURIComponent(trimmed)}&difficulty=${difficulty}`,
      );
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to start generation. Try again.";
      setFormError(errMsg);
    } finally {
      setIsGenerating(false);
    }
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {greeting}, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          What do you want to master today?
        </p>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            label: "Credits Left",
            value: creditsLoading ? "—" : credits?.balance,
            icon: Zap,
            iconColor: "text-brand-600 dark:text-brand-400",
            iconBg: "bg-brand-50 dark:bg-brand-950/60",
          },
          {
            label: "Lifetime Used",
            value: creditsLoading ? "—" : credits?.lifetime_used,
            icon: BookOpen,
            iconColor: "text-emerald-600 dark:text-emerald-400",
            iconBg: "bg-emerald-50 dark:bg-emerald-950/60",
          },
          {
            label: "Notes Generated",
            value: notesLoading ? "—" : totalNotes,
            icon: Plus,
            iconColor: "text-sky-600 dark:text-sky-400",
            iconBg: "bg-sky-50 dark:bg-sky-950/60",
          },
          {
            label: "Cost per Note",
            value: "1-3 cr",
            icon: Clock,
            iconColor: "text-amber-600 dark:text-amber-400",
            iconBg: "bg-amber-50 dark:bg-amber-950/60",
          },
        ].map(({ label, value, icon: Icon, iconColor, iconBg }) => (
          <Card key={label} className="flex items-center gap-4">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                iconBg,
              )}
            >
              <Icon size={18} className={iconColor} />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Generate Form ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Generate Notes</CardTitle>
            <span className="rounded-full bg-brand-50 dark:bg-brand-950/60 border border-brand-100 dark:border-brand-800/60 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300">
              {DIFFICULTY_CREDIT_COST[difficulty]} {DIFFICULTY_CREDIT_COST[difficulty] === 1 ? "credit" : "credits"}
            </span>
          </CardHeader>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Topic
              </label>
              <input
                type="text"
                placeholder="e.g. Operating Systems: Virtual Memory"
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  if (formError) setFormError(null);
                }}
                className={cn(
                  "w-full rounded-xl border bg-white dark:bg-slate-950 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100",
                  "placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-colors",
                  formError
                    ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 dark:focus:ring-rose-950"
                    : "border-slate-200 dark:border-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950",
                )}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Difficulty
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950 transition-colors"
              >
                {DIFFICULTY_OPTIONS.map((d) => (
                  <option key={d} value={d} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {capitalize(d)} ({DIFFICULTY_CREDIT_COST[d]} {DIFFICULTY_CREDIT_COST[d] === 1 ? "credit" : "credits"})
                  </option>
                ))}
              </select>
            </div>
            {formError && (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{formError}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              isLoading={isGenerating}
              leftIcon={<Zap size={15} />}
            >
              Generate Notes ({DIFFICULTY_CREDIT_COST[difficulty]} {DIFFICULTY_CREDIT_COST[difficulty] === 1 ? "credit" : "credits"})
            </Button>
          </form>
        </Card>

        {/* ── Recent Notes ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Notes</CardTitle>
            <Link
              to="/history"
              className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 hover:underline"
            >
              View all →
            </Link>
          </CardHeader>
          {notesLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : recentNotes.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
              No notes yet. Generate your first one!
            </p>
          ) : (
            <div className="space-y-1">
              {recentNotes.map((note) => (
                <Link
                  key={note.id}
                  to={`/notes/${note.id}`}
                  className="flex items-center justify-between rounded-xl p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80 group"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white">
                      {note.topic}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      {formatDate(note.created_at)}
                    </p>
                  </div>
                  <Badge
                    label={capitalize(note.difficulty)}
                    className={cn("ml-3 shrink-0", difficultyColor(note.difficulty))}
                  />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
