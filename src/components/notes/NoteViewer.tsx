import { DiagramRenderer } from "./DiagramRenderer";
import { QuestionCard } from "./QuestionCard";
import type { Note } from "@/types";
import { Badge } from "@/components/common/Badge";
import { cn, capitalize, difficultyColor, formatDate } from "@/lib/utils";

interface NoteViewerProps {
  note: Note;
  revisionMode?: boolean;
  includeAnswers?: boolean;
}

export function NoteViewer({ note, revisionMode = false, includeAnswers = true }: NoteViewerProps) {
  // Simple markdown renderer: convert headers, bold, code, tables, lists
  const renderMarkdown = (md: string) => {
    const lines = md.split("\n");
    const elements: React.ReactNode[] = [];
    let tableRows: string[][] = [];

    const flushTable = (key: number) => {
      if (tableRows.length === 0) return;
      const headers = tableRows[0];
      const bodyRows = tableRows.slice(1);
      elements.push(
        <div key={`tbl-${key}`} className="my-3 overflow-x-auto print:overflow-visible rounded-xl print:rounded-none border border-slate-200 dark:border-slate-800 print:border-slate-300 print:break-inside-avoid">
          <table className="w-full border-collapse text-left text-sm print:text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 dark:bg-slate-800 dark:border-slate-700 print:bg-slate-100 print:border-slate-300">
              <tr>
                {headers.map((c, j) => (
                  <th key={j} className="px-3.5 py-2.5 print:px-2.5 print:py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 print:text-slate-900">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900 print:bg-white print:divide-slate-200">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition-colors print:break-inside-avoid">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2 print:px-2.5 print:py-1.5 text-slate-700 dark:text-slate-300 print:text-slate-800">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    };

    lines.forEach((line, i) => {
      if (line.startsWith("| ")) {
        const cells = line.split("|").filter(Boolean).map((c) => c.trim());
        const isSeparator = cells.every((c) => c.startsWith("--") || c.startsWith(":-") || c.startsWith("-:"));
        if (!isSeparator) {
          tableRows.push(cells);
        }
        return;
      } else if (tableRows.length > 0) {
        flushTable(i);
      }

      if (line.startsWith("## ")) {
        elements.push(<h2 key={i} className="mt-6 mb-2 text-lg font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-1">{line.slice(3)}</h2>);
      } else if (line.startsWith("### ")) {
        elements.push(<h3 key={i} className="mt-4 mb-1.5 text-base font-bold text-slate-800 dark:text-slate-200">{line.slice(4)}</h3>);
      } else if (line.startsWith("```")) {
        // skip fence markers
      } else if (line.startsWith("- ")) {
        elements.push(<li key={i} className="ml-4 list-disc text-sm text-slate-700 dark:text-slate-300">{renderInline(line.slice(2))}</li>);
      } else if (line.trim() === "") {
        elements.push(<div key={i} className="h-2" />);
      } else {
        elements.push(<p key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{renderInline(line)}</p>);
      }
    });

    if (tableRows.length > 0) {
      flushTable(lines.length);
    }

    return elements;
  };

  const renderInline = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-bold text-slate-900 dark:text-slate-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={i} className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-mono text-xs text-brand-700 dark:bg-slate-800 dark:border-slate-700 dark:text-brand-300">{part.slice(1, -1)}</code>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const highPriority = note.questions.filter((q) => q.priority === "high");
  const medPriority = note.questions.filter((q) => q.priority === "medium");
  const lowPriority = note.questions.filter((q) => q.priority === "low");

  return (
    <div className="space-y-8 print:space-y-6">
      {/* Print-only document header */}
      <div className="hidden print:block print:border-b-2 print:border-slate-800 print:pb-4 print:mb-6">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600 print:text-brand-700">
              StudyForge AI — Exam Revision Notes
            </span>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">{note.topic}</h1>
            <p className="text-xs text-slate-500 mt-1">Generated {formatDate(note.created_at)}</p>
          </div>
          <div className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-800">
            Difficulty: {capitalize(note.difficulty)}
          </div>
        </div>
      </div>

      {/* Screen Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{note.topic}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Generated {formatDate(note.created_at)}
          </p>
        </div>
        <Badge
          label={capitalize(note.difficulty)}
          className={cn("text-sm px-3 py-1", difficultyColor(note.difficulty))}
        />
      </div>

      {/* Content (only in full view) */}
      {!revisionMode && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 print:text-slate-700">
            Notes Summary
          </h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 print:shadow-none print:border-none print:p-0 print:space-y-2.5">
            <table className="w-full border-collapse hidden" />
            {renderMarkdown(note.content)}
          </div>
        </section>
      )}

      {/* Diagrams (only in full view) */}
      {!revisionMode && note.diagrams.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 print:text-slate-700">
            Diagrams & Charts
          </h2>
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-1 print:gap-6">
            {note.diagrams.map((d) => (
              <DiagramRenderer key={d.id} diagram={d} />
            ))}
          </div>
        </section>
      )}

      {/* Questions by priority */}
      {[
        { label: "High Priority Questions", items: highPriority, badge: "text-rose-700 bg-rose-50 border-rose-200" },
        { label: "Medium Priority Questions", items: medPriority, badge: "text-amber-700 bg-amber-50 border-amber-200" },
        { label: "Low Priority Questions", items: lowPriority, badge: "text-emerald-700 bg-emerald-50 border-emerald-200" },
      ].map(({ label, items, badge }) =>
        items.length === 0 ? null : (
          <section key={label}>
            <div className="mb-3 flex items-center gap-2 print:break-after-avoid">
              <span className={cn("inline-block h-2 w-2 rounded-full", badge.includes("rose") ? "bg-rose-500" : badge.includes("amber") ? "bg-amber-500" : "bg-emerald-500")} />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 print:text-slate-700">
                {label}
              </h2>
            </div>
            <div className="space-y-2.5">
              {items.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  revisionMode={revisionMode}
                  includeAnswers={includeAnswers}
                />
              ))}
            </div>
          </section>
        )
      )}

      {/* Print-only document footer */}
      <div className="hidden print:block print:mt-10 print:pt-4 print:border-t print:border-slate-300 text-center text-xs text-slate-500">
        Generated by StudyForge AI
      </div>
    </div>
  );
}
