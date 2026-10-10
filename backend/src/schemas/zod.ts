import { z } from "zod";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const GoogleCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().optional(),
});

// ─── Notes ────────────────────────────────────────────────────────────────────

export const GenerateNoteSchema = z.object({
  topic: z
    .string()
    .min(3, "Topic must be at least 3 characters")
    .max(200, "Topic must be at most 200 characters")
    .trim(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export type GenerateNoteInput = z.infer<typeof GenerateNoteSchema>;

// ─── Billing ──────────────────────────────────────────────────────────────────

export const BuyCreditsSchema = z.object({
  package: z.enum(["starter", "pro", "unlimited"]),
});

export type BuyCreditsInput = z.infer<typeof BuyCreditsSchema>;

// ─── Gemini Response Schema (validates AI output before saving) ───────────────

const DiagramTypeEnum = z.enum(["mermaid", "recharts_bar", "recharts_pie", "recharts_line"]);

const GeminiDiagramSchema = z.object({
  id: z.string().min(1),
  type: DiagramTypeEnum,
  title: z.string().min(1).max(200),
  /** For mermaid: raw mermaid string. For recharts: structured object or JSON string */
  data: z.union([
    z.string().min(1),
    z.object({
      keys: z.array(z.string()).min(1),
      values: z.array(z.record(z.union([z.string(), z.number()]))).min(1),
    }),
  ]),
});

const GeminiQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(5).max(1000),
  answer: z.string().min(10).max(3000),
  priority: z.enum(["high", "medium", "low"]),
  tags: z.array(z.string().max(50)).max(10),
});

export const GeminiNoteResponseSchema = z.object({
  content: z.string().min(50).max(20000),
  diagrams: z.array(GeminiDiagramSchema).max(6),
  questions: z.array(GeminiQuestionSchema).min(3).max(20),
});

export type GeminiNoteResponse = z.infer<typeof GeminiNoteResponseSchema>;

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? Math.max(1, parseInt(v, 10)) : 1)),
  per_page: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(100, Math.max(1, parseInt(v, 10))) : 20)),
});
