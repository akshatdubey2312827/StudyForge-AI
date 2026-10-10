import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, BookOpen, Eye, Download } from "lucide-react";
import { getNote } from "@/api/notes";
import type { Note } from "@/types";
import { NoteViewer } from "@/components/notes/NoteViewer";
import { Button } from "@/components/common/Button";
import { Spinner } from "@/components/common/Spinner";
import { usePrint } from "@/context/PrintContext";

export function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const { isPrinting, isPreparing, printNote } = usePrint();

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

  const handleDownloadPdf = async () => {
    if (!note) return;
    await printNote({ title: note.topic });
  };

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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8 print:p-0 print:max-w-none">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="flex-1" />

        {/* Download PDF & Include Answers Controls */}
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-sm">
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
            onClick={handleDownloadPdf}
          >
            {isPreparing ? "Preparing PDF..." : "Download PDF"}
          </Button>
        </div>

        <Link to={`/revision/${noteId}`}>
          <Button size="sm" variant="secondary" leftIcon={<Eye size={14} />}>
            Revision Mode
          </Button>
        </Link>
      </div>
      <NoteViewer note={note} includeAnswers={includeAnswers} />
    </div>
  );
}
