// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
}

/**
 * Session returned by GET /api/auth/session.
 * Auth is fully cookie-based (httpOnly) — no tokens in JS memory.
 */
export interface AuthSession {
  user: User;
}

// ─── Credits ──────────────────────────────────────────────────────────────────
export interface CreditBalance {
  balance: number;
  lifetime_used: number;
}

// ─── Notes ────────────────────────────────────────────────────────────────────
export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTY_CREDIT_COST: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};
export type NoteStatus = "pending" | "processing" | "complete" | "failed";
export type DiagramType = "mermaid" | "recharts_bar" | "recharts_pie" | "recharts_line";
export type PriorityLevel = "high" | "medium" | "low";

export interface GenerateNotePayload {
  topic: string;
  difficulty: Difficulty;
}

export interface GenerateNoteResponse {
  job_id: string;
  status: NoteStatus;
  estimated_seconds: number;
}

export interface JobStatusResponse {
  job_id: string;
  status: NoteStatus;
  progress: number; // 0-100
  note_id?: string;
}

export interface Diagram {
  id: string;
  type: DiagramType;
  title: string;
  /** Mermaid: raw string. Recharts: structured JSON */
  data: string | RechartsData;
}

export interface RechartsData {
  keys: string[];
  values: Array<Record<string, string | number>>;
}

export interface Question {
  id: string;
  question: string;
  answer: string;
  priority: PriorityLevel;
  tags: string[];
}

export interface Note {
  id: string;
  job_id: string;
  user_id: string;
  topic: string;
  difficulty: Difficulty;
  status: NoteStatus;
  content: string; // markdown
  diagrams: Diagram[];
  questions: Question[];
  created_at: string;
  updated_at: string;
}

export interface NoteSummary {
  id: string;
  topic: string;
  difficulty: Difficulty;
  status: NoteStatus;
  created_at: string;
}

export interface NoteListResponse {
  notes: NoteSummary[];
  total: number;
  page: number;
  per_page: number;
}

// ─── Billing ──────────────────────────────────────────────────────────────────
export type CreditPackage = "starter" | "pro" | "unlimited";

export interface BuyCreditsPayload {
  package: CreditPackage;
}

export interface BuyCreditsResponse {
  /** Stripe Checkout URL — redirect to this to start payment. */
  checkout_url: string;
  /** Stripe Checkout Session ID (for reconciliation if needed). */
  session_id: string;
}


export interface Transaction {
  id: string;
  amount: number; // credits delta (positive = purchase, negative = usage)
  description: string;
  created_at: string;
  paid_amount?: number; // stored in smallest currency unit (paise/cents)
  currency?: string; // stored currency code, e.g. "inr" or "usd"
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
}
