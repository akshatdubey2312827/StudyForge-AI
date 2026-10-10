import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, BookOpen, FlipHorizontal2 } from "lucide-react";
import { getNote } from "@/api/notes";
import type { Note } from "@/types";
import { NoteViewer } from "@/components/notes/NoteViewer";
import { Button } from "@/components/common/Button";
import { Spinner } from "@/components/common/Spinner";

export function RevisionPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!noteId) return;
    setIsLoading(true);
    getNote(noteId)
      .then((n) => {
        if (!n) setError("Note not found.");
        else setNote(n);
      })
      .catch(() => setError("Failed to load note."))
      .finally(() => setIsLoading(false));
  }, [noteId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-32">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex flex-col items-center gap-4 py-32 text-center">
        <BookOpen size={48} className="text-slate-300 dark:text-slate-600" />
        <p className="text-slate-700 dark:text-slate-200 font-medium">{error ?? "Note not found."}</p>
        <Button variant="secondary" onClick={() => navigate("/history")}>
          Back to History
        </Button>
      </div>
    );
  }

  const high = note.questions.filter((q) => q.priority === "high").length;
  const total = note.questions.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="flex-1" />
        <Link to={`/notes/${noteId}`}>
          <Button size="sm" variant="secondary" leftIcon={<BookOpen size={14} />}>
            Full Notes
          </Button>
        </Link>
      </div>

      {/* Revision banner */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 dark:border-brand-900/60 dark:bg-brand-950/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/70 dark:text-brand-300">
            <FlipHorizontal2 size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-brand-900 dark:text-brand-200">Revision Mode</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {total} questions · {high} high priority · Click any question to reveal the answer
            </p>
          </div>
        </div>
      </div>

      <NoteViewer note={note} revisionMode={true} />
    </div>
  );
}
