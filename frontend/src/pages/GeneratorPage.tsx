import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { CheckCircle, XCircle, BookMarked, Eye, Clock, Download } from "lucide-react";
import { useJobStatus } from "@/hooks/useJobStatus";
import { getNote } from "@/api/notes";
import { generateNote } from "@/api/notes";
import { DIFFICULTY_CREDIT_COST, type Difficulty, type Note } from "@/types";
import { NoteViewer } from "@/components/notes/NoteViewer";
import { Button } from "@/components/common/Button";
import { useCredits } from "@/hooks/useCredits";
import { usePrint } from "@/context/PrintContext";
import { cn, capitalize } from "@/lib/utils";

const DIFFICULTY_OPTIONS: Difficulty[] = ["easy", "medium", "hard"];

// ─── Pending / Progress UI ────────────────────────────────────────────────────
function JobProgress({ progress, status }: { progress: number; status: string | null }) {
  const statusLabel: Record<string, string> = {
    pending: "Queuing your request…",
    processing: "AI is generating your notes…",
    complete: "Done!",
    failed: "Something went wrong.",
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" strokeWidth="8" className="stroke-slate-200 dark:stroke-slate-800" />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="#4f46e5"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
            className="transition-all duration-500"
          />
        </svg>
        <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{progress}%</span>
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {statusLabel[status ?? "pending"] ?? "Working…"}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          This usually takes 10–30 seconds
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {["Analysing topic", "Structuring content", "Generating Q&A", "Building diagrams"].map(
          (step, i) => (
            <span
              key={step}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 border",
                progress > i * 25
                  ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/60 dark:text-brand-300"
                  : "border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500",
              )}
            >
              {step}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

// ─── Generation Form (when no job started) ────────────────────────────────────
function GenerateForm({
  defaultTopic,
  defaultDifficulty,
  onSubmit,
  isLoading,
  error,
}: {
  defaultTopic: string;
  defaultDifficulty: Difficulty;
  onSubmit: (topic: string, difficulty: Difficulty) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [topic, setTopic] = useState(defaultTopic);
  const [difficulty, setDifficulty] = useState<Difficulty>(defaultDifficulty);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed) {
      setValidationError("Please enter a topic to generate notes.");
      return;
    }
    if (trimmed.length < 3) {
      setValidationError("Topic must be at least 3 characters.");
      return;
    }
    if (trimmed.length > 200) {
      setValidationError("Topic must be at most 200 characters.");
      return;
    }
    setValidationError(null);
    onSubmit(trimmed, difficulty);
  }

  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Generate Exam Notes</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Enter a topic and difficulty to get AI-generated study notes, diagrams, and practice questions.
      </p>

      {error && (
        <div className="mb-6 flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
          <p className="font-semibold">{error}</p>
          {error.toLowerCase().includes("credit") && (
            <Link
              to="/billing"
              className="inline-flex items-center text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 underline"
            >
              Go to Billing to purchase credits →
            </Link>
          )}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Topic
          </label>
          <input
            type="text"
            placeholder="e.g. Dijkstra's Algorithm, Photosynthesis, French Revolution…"
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              if (validationError) setValidationError(null);
            }}
            className={cn(
              "w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 focus:outline-none transition-colors",
              validationError
                ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 dark:focus:ring-rose-950"
                : "border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:focus:border-brand-400 dark:focus:ring-brand-950",
            )}
          />
          {validationError && (
            <p className="mt-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
              {validationError}
            </p>
          )}
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Difficulty
            </label>
            <span className="text-xs text-slate-400 dark:text-slate-400">
              Cost: <strong className="text-slate-700 dark:text-slate-200">{DIFFICULTY_CREDIT_COST[difficulty]} {DIFFICULTY_CREDIT_COST[difficulty] === 1 ? "credit" : "credits"}</strong>
            </span>
          </div>
          <div className="flex gap-2">
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={cn(
                  "flex-1 rounded-xl border py-2 text-sm font-semibold transition-all flex flex-col items-center justify-center gap-0.5",
                  difficulty === d
                    ? d === "easy"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : d === "medium"
                        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100",
                )}
              >
                <span>{capitalize(d)}</span>
                <span className="text-[11px] font-normal opacity-80">{DIFFICULTY_CREDIT_COST[d]} cr</span>
              </button>
            ))}
          </div>
        </div>
        <Button
          type="submit"
          className="w-full"
          size="lg"
          isLoading={isLoading}
        >
          Generate Notes ({DIFFICULTY_CREDIT_COST[difficulty]} {DIFFICULTY_CREDIT_COST[difficulty] === 1 ? "credit" : "credits"})
        </Button>
      </form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function GeneratorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh: refreshCredits } = useCredits();

  const jobIdParam = searchParams.get("job_id");
  const topicParam = searchParams.get("topic") ?? "";
  const difficultyParam = (searchParams.get("difficulty") ?? "medium") as Difficulty;

  const [note, setNote] = useState<Note | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [jobFailed, setJobFailed] = useState(false);
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const { isPrinting, isPreparing, printNote } = usePrint();

  const onComplete = useCallback(
    async (noteId: string) => {
      refreshCredits();
      const fetched = await getNote(noteId);
      if (fetched) setNote(fetched);
      else setFetchError("Note not found after generation.");
    },
    [refreshCredits],
  );

  const onFailed = useCallback(() => {
    refreshCredits();
    setJobFailed(true);
  }, [refreshCredits]);

  const { status, progress, error: pollError, start } = useJobStatus({ onComplete, onFailed });

  useEffect(() => {
    if (jobIdParam) {
      start(jobIdParam);
    }
  }, [jobIdParam, start]);

  async function handleGenerate(topic: string, difficulty: Difficulty) {
    setIsStarting(true);
    setJobFailed(false);
    setGenerateError(null);
    try {
      const res = await generateNote({ topic, difficulty });
      refreshCredits();
      setSearchParams({ job_id: res.job_id, topic, difficulty });
      start(res.job_id);
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to generate note. Please try again.";
      setGenerateError(errMsg);
    } finally {
      setIsStarting(false);
    }
  }

  // ── States ──────────────────────────────────────────────────────────────────
  if (!jobIdParam && !note) {
    return (
      <div className="px-8">
        <GenerateForm
          defaultTopic={topicParam}
          defaultDifficulty={difficultyParam}
          onSubmit={handleGenerate}
          isLoading={isStarting}
          error={generateError}
        />
      </div>
    );
  }

  if (pollError) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-32 text-center">
        <Clock size={48} className="text-amber-500" />
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Taking Longer Than Expected</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{pollError}</p>
        <div className="mt-2 flex gap-3">
          <Button variant="secondary" onClick={() => navigate("/dashboard")}>
            Dashboard
          </Button>
          <Button onClick={() => navigate("/generate")}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (jobFailed) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <XCircle size={48} className="text-rose-500" />
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Generation Failed</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">Something went wrong. Please try again.</p>
        <Button variant="secondary" onClick={() => navigate("/generate")}>
          Try Again
        </Button>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center gap-3 py-32 text-center">
        <XCircle size={48} className="text-rose-500" />
        <p className="text-rose-600 dark:text-rose-400 font-medium">{fetchError}</p>
      </div>
    );
  }

  if (!note || status !== "complete") {
    return (
      <div className="px-8">
        <JobProgress progress={progress} status={status} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8 print:p-0 print:max-w-none">
      {/* Success banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/50 px-4 py-3 print:hidden">
        <CheckCircle size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
        <p className="flex-1 min-w-[200px] text-sm font-medium text-emerald-800 dark:text-emerald-300">
          Notes generated successfully!
        </p>

        {/* Download PDF & Include Answers Controls */}
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-sm">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeAnswers}
              onChange={(e) => setIncludeAnswers(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 cursor-pointer"
            />
            <span>Include answers</span>
          </label>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
          <Button
            size="sm"
            variant="secondary"
            leftIcon={isPreparing ? undefined : <Download size={14} />}
            isLoading={isPreparing || isPrinting}
            onClick={() => printNote({ title: note.topic })}
          >
            {isPreparing ? "Preparing PDF..." : "Download PDF"}
          </Button>
        </div>

        <Link to={`/revision/${note.id}`}>
          <Button size="sm" variant="secondary" leftIcon={<Eye size={14} />}>
            Revision Mode
          </Button>
        </Link>
        <Link to="/history">
          <Button size="sm" variant="ghost" leftIcon={<BookMarked size={14} />}>
            History
          </Button>
        </Link>
      </div>

      <NoteViewer note={note} includeAnswers={includeAnswers} />
    </div>
  );
}
