/**
 * Mock handlers — thin wrappers around mock data.
 * Each function matches the exact signature of the real API function it replaces.
 * Swap implementation body only when connecting to a real backend.
 */

import { delay } from "@/lib/utils";
import {
  MOCK_SESSION,
  MOCK_CREDIT_BALANCE,
  MOCK_NOTE_SUMMARIES,
  MOCK_NOTES_DB,
  MOCK_TRANSACTIONS,
} from "@/mocks/data";
import type {
  AuthSession,
  BuyCreditsPayload,
  BuyCreditsResponse,
  CreditBalance,
  GenerateNotePayload,
  GenerateNoteResponse,
  JobStatusResponse,
  Note,
  NoteListResponse,
  TransactionListResponse,
} from "@/types";

// These types are only used internally in mock handlers
type OAuthCallbackPayload = { code: string; state: string };
type OAuthCallbackResponse = { session: AuthSession };


// ─── Auth ─────────────────────────────────────────────────────────────────────

/** Returns a fake Google OAuth redirect URL */
export async function mockGetGoogleOAuthUrl(): Promise<{ redirect_url: string }> {
  await delay(300);
  return { redirect_url: "/__mock_google_oauth_redirect__" };
}

/** Simulates the OAuth callback — always succeeds */
export async function mockHandleOAuthCallback(
  _payload: OAuthCallbackPayload,
): Promise<OAuthCallbackResponse> {
  await delay(800);
  return { session: MOCK_SESSION };
}

/** Returns the current in-memory session */
export async function mockGetSession(): Promise<AuthSession | null> {
  await delay(100);
  return MOCK_SESSION;
}

export async function mockLogout(): Promise<void> {
  await delay(200);
}

// ─── Credits ──────────────────────────────────────────────────────────────────

export async function mockGetCreditBalance(): Promise<CreditBalance> {
  await delay(200);
  return { ...MOCK_CREDIT_BALANCE };
}

// ─── Notes ────────────────────────────────────────────────────────────────────

let jobCounter = 100;
const pendingJobs: Record<string, { createdAt: number; noteId: string }> = {};

export async function mockGenerateNote(
  payload: GenerateNotePayload,
): Promise<GenerateNoteResponse> {
  await delay(400);
  const job_id = `job_${++jobCounter}`;
  // pick an existing note to "return" once complete (or note_01 as default)
  pendingJobs[job_id] = { createdAt: Date.now(), noteId: "note_01" };

  // Also insert a new mock note for this topic into the DB for realism
  const newNoteId = `note_mock_${jobCounter}`;
  MOCK_NOTES_DB[newNoteId] = {
    ...MOCK_NOTES_DB["note_01"],
    id: newNoteId,
    job_id,
    topic: payload.topic,
    difficulty: payload.difficulty,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  pendingJobs[job_id].noteId = newNoteId;

  return {
    job_id,
    status: "pending",
    estimated_seconds: 10,
  };
}

export async function mockPollJobStatus(
  job_id: string,
): Promise<JobStatusResponse> {
  await delay(200);
  const job = pendingJobs[job_id];
  if (!job) {
    return { job_id, status: "failed", progress: 0 };
  }

  const elapsed = (Date.now() - job.createdAt) / 1000; // seconds
  // Simulate: pending → processing (2 s) → complete (10 s)
  if (elapsed < 2) {
    return { job_id, status: "pending", progress: 0 };
  } else if (elapsed < 10) {
    const progress = Math.min(90, Math.round(((elapsed - 2) / 8) * 90));
    return { job_id, status: "processing", progress };
  } else {
    return { job_id, status: "complete", progress: 100, note_id: job.noteId };
  }
}

export async function mockGetNote(note_id: string): Promise<Note | null> {
  await delay(250);
  return MOCK_NOTES_DB[note_id] ?? null;
}

export async function mockListNotes(
  page = 1,
  per_page = 20,
): Promise<NoteListResponse> {
  await delay(300);
  const start = (page - 1) * per_page;
  const all = Object.values(MOCK_NOTES_DB).map((n) => ({
    id: n.id,
    topic: n.topic,
    difficulty: n.difficulty,
    status: n.status,
    created_at: n.created_at,
  }));
  return {
    notes: all.slice(start, start + per_page),
    total: all.length,
    page,
    per_page,
  };
}

// ─── Billing ──────────────────────────────────────────────────────────────────

const CREDIT_PACKAGES = {
  starter: 50,
  pro: 150,
  unlimited: 500,
};

export async function mockBuyCredits(
  payload: BuyCreditsPayload,
): Promise<BuyCreditsResponse> {
  await delay(400);
  const credits = CREDIT_PACKAGES[payload.package];
  return {
    checkout_url: `/__mock_stripe_checkout__?pkg=${payload.package}&credits=${credits}`,
    session_id: `cs_mock_${Date.now()}`,
  };
}

export async function mockListTransactions(
  page = 1,
  per_page = 20,
): Promise<TransactionListResponse> {
  await delay(250);
  const start = (page - 1) * per_page;
  return {
    transactions: MOCK_TRANSACTIONS.slice(start, start + per_page),
    total: MOCK_TRANSACTIONS.length,
  };
}
