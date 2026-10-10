import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Zap, TrendingUp, Infinity, ArrowUpRight, ArrowDownLeft, CheckCircle, AlertCircle } from "lucide-react";
import { buyCredits, listTransactions } from "@/api/billing";
import { useCredits } from "@/hooks/useCredits";
import type { CreditPackage, Transaction } from "@/types";
import { Card, CardHeader, CardTitle } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Spinner } from "@/components/common/Spinner";
import { formatDate, cn } from "@/lib/utils";

import { PACKAGES, formatINR, formatTransactionPrice } from "@/constants/packages";

const PACKAGE_ICONS: Record<CreditPackage, React.ReactNode> = {
  starter: <Zap size={22} className="text-brand-600 dark:text-brand-400" />,
  pro: <TrendingUp size={22} className="text-emerald-600 dark:text-emerald-400" />,
  unlimited: <Infinity size={22} className="text-amber-600 dark:text-amber-400" />,
};

export function BillingPage() {
  const [searchParams] = useSearchParams();
  const successParam = searchParams.get("success") === "true";
  const creditsAddedParam = searchParams.get("credits_added");
  const cancelledParam = searchParams.get("cancelled") === "true";

  const { credits, isLoading: creditsLoading, refresh: refreshCredits } = useCredits();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnsLoading, setTxnsLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [purchasing, setPurchasing] = useState<CreditPackage | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  useEffect(() => {
    refreshCredits();
    listTransactions()
      .then((txns) => setTransactions(txns.transactions))
      .finally(() => setTxnsLoading(false));
  }, [refreshCredits]);

  useEffect(() => {
    if (successParam) {
      refreshCredits();
    }
  }, [successParam, refreshCredits]);

  async function handleBuy(pkg: CreditPackage) {
    setSelectedPackage(pkg);
    setPurchasing(pkg);
    setBuyError(null);
    try {
      console.log(`[Billing] Requesting checkout session for package: "${pkg}"`);
      const res = await buyCredits({ package: pkg });
      console.log(`[Billing] Checkout session created, redirecting to:`, res.checkout_url);
      // Full-page redirect to Stripe Checkout — backend webhook handles credit grant.
      window.location.href = res.checkout_url;
    } catch (e: any) {
      console.error(`[Billing] Failed checkout for package "${pkg}":`, e);
      const errMsg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "Failed to start checkout. Please try again.";
      setBuyError(errMsg);
      setPurchasing(null);
    }
  }

  if (creditsLoading && txnsLoading) {
    return (
      <div className="flex h-full items-center justify-center py-32">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Billing</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your credits and purchase history
        </p>
      </div>

      {/* Success banner after returning from checkout */}
      {successParam && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle size={20} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p>
            Payment successful!{" "}
            {creditsAddedParam
              ? `${creditsAddedParam} credits have been added to your account.`
              : "Your credits have been updated."}
          </p>
        </div>
      )}

      {/* Cancelled banner */}
      {cancelledParam && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
          <AlertCircle size={20} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <p>Checkout was cancelled. No charges were made.</p>
        </div>
      )}

      {/* Balance card */}
      <Card className="flex items-center gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 border border-brand-100 dark:bg-brand-950/70 dark:border-brand-900/60">
          <CreditCard size={28} className="text-brand-600 dark:text-brand-400" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Current Balance</p>
          <p className="text-4xl font-bold text-slate-900 dark:text-slate-100">{credits?.balance ?? "—"}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            credits · {credits?.lifetime_used ?? "—"} used lifetime
          </p>
        </div>
      </Card>

      {/* Error banner — shown if checkout session creation fails */}
      {buyError && (
        <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
          <AlertCircle size={18} className="shrink-0 text-rose-600 dark:text-rose-400" />
          <p>{buyError}</p>
        </div>
      )}

      {/* Credit packages */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Buy Credits
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PACKAGES.map((pkg) => {
            const isSelected = selectedPackage === pkg.id || purchasing === pkg.id;
            return (
              <div
                key={pkg.id}
                className={cn(
                  "rounded-2xl border p-5 flex flex-col gap-4 transition-all",
                  isSelected
                    ? "border-brand-400 bg-brand-50/60 shadow-md shadow-brand-100 dark:border-brand-500 dark:bg-brand-950/40 dark:shadow-none"
                    : "border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900",
                )}
              >
                {pkg.isPopular && (
                  <span
                    className={cn(
                      "self-start rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
                      isSelected
                        ? "bg-brand-100 text-brand-700 dark:bg-brand-900/80 dark:text-brand-300"
                        : "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
                    )}
                  >
                    Most Popular
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
                    {PACKAGE_ICONS[pkg.id]}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{pkg.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{pkg.credits} credits</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{formatINR(pkg.amount)}</p>
                <Button
                  variant={isSelected ? "primary" : "secondary"}
                  className="w-full"
                  isLoading={purchasing === pkg.id}
                  disabled={purchasing !== null && purchasing !== pkg.id}
                  onClick={() => handleBuy(pkg.id)}
                >
                  Buy Now
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        {transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 py-3">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-medium",
                    tx.amount > 0
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-900/60"
                      : "bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-900/60",
                  )}
                >
                  {tx.amount > 0 ? (
                    <ArrowUpRight size={15} />
                  ) : (
                    <ArrowDownLeft size={15} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{tx.description}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{formatDate(tx.created_at)}</span>
                    {tx.paid_amount !== undefined && tx.paid_amount !== null && (
                      <>
                        <span>•</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {formatTransactionPrice(tx.paid_amount, tx.currency)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    tx.amount > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400",
                  )}
                >
                  {tx.amount > 0 ? "+" : ""}
                  {tx.amount} cr
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
