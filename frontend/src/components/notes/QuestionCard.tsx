import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Question } from "@/types";
import { Badge } from "@/components/common/Badge";
import { cn, capitalize, priorityColor } from "@/lib/utils";

interface QuestionCardProps {
  question: Question;
  revisionMode?: boolean;
  includeAnswers?: boolean;
}

export function QuestionCard({ question, revisionMode = false, includeAnswers = true }: QuestionCardProps) {
  const [isOpen, setIsOpen] = useState(!revisionMode);

  return (
    <div
      className={cn(
        "rounded-xl border transition-all bg-white shadow-sm dark:bg-slate-900 print:shadow-none print:border-slate-300 print:bg-white print:break-inside-avoid",
        "border-slate-200 dark:border-slate-800",
        revisionMode && "cursor-pointer hover:border-brand-300 hover:shadow-md dark:hover:border-brand-600 print:hover:shadow-none",
      )}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 p-4 text-left cursor-pointer print:cursor-default"
        onClick={() => revisionMode && setIsOpen((v) => !v)}
      >
        <Badge
          label={capitalize(question.priority)}
          className={cn("mt-0.5 shrink-0 print:border", priorityColor(question.priority))}
        />
        <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-slate-100 print:text-slate-900">
          {question.question}
        </span>
        {revisionMode && (
          <span className="shrink-0 text-slate-400 dark:text-slate-500 print:hidden">
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </button>

      <div
        className={cn(
          "border-t border-slate-100 dark:border-slate-800 print:border-slate-200 px-4 pb-4 pt-3",
          isOpen ? "block" : "hidden",
          includeAnswers ? "print:!block" : "print:!hidden",
        )}
      >
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 print:text-slate-800">
          {question.answer}
        </p>
        {question.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 print:hidden">
            {question.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
