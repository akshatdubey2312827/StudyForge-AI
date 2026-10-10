/**
 * Billing API — real backend calls via shared apiClient.
 */
import { apiClient } from "./client";
import type {
  BuyCreditsPayload,
  BuyCreditsResponse,
  CreditBalance,
  TransactionListResponse,
} from "@/types";

/**
 * GET /api/billing/balance
 * Returns { balance, lifetime_used }.
 */
export async function getCreditBalance(): Promise<CreditBalance> {
  const res = await apiClient.get<CreditBalance>("/api/billing/balance", {
    params: { _t: Date.now() },
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  });
  return res.data;
}

/**
 * POST /api/billing/checkout
 * Creates a Stripe checkout session and returns the redirect URL.
 * Caller should immediately redirect: window.location.href = res.checkout_url
 */
export async function buyCredits(
  payload: BuyCreditsPayload,
): Promise<BuyCreditsResponse> {
  const res = await apiClient.post<BuyCreditsResponse>(
    "/api/billing/checkout",
    payload,
  );
  return res.data;
}

/**
 * GET /api/billing/transactions
 * Returns paginated purchase transaction history.
 * Each entry: { id, amount (credits), description, created_at }
 */
export async function listTransactions(
  page = 1,
  per_page = 20,
): Promise<TransactionListResponse> {
  const res = await apiClient.get<TransactionListResponse>(
    "/api/billing/transactions",
    { params: { page, per_page } },
  );
  return res.data;
}
