import type { CreditPackage } from "@/types";

export interface PackageDefinition {
  id: CreditPackage;
  name: string;
  credits: number;
  amount: number; // in INR (₹)
  amountPaise: number; // in paise (₹1 = 100 paise)
  isPopular?: boolean;
}

export const PACKAGES: PackageDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    credits: 50,
    amount: 399,
    amountPaise: 39900,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 150,
    amount: 999,
    amountPaise: 99900,
    isPopular: true,
  },
  {
    id: "unlimited",
    name: "Unlimited",
    credits: 500,
    amount: 2499,
    amountPaise: 249900,
  },
];

export const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/**
 * Format an INR rupee value (e.g. 399 -> ₹399) using Intl.NumberFormat
 */
export function formatINR(amount: number): string {
  return inrFormatter.format(amount);
}

/**
 * Format a stored transaction amount that is in the smallest currency unit
 * (cents for USD, paise for INR) dividing by 100, handling the stored currency safely.
 */
export function formatTransactionPrice(amountInSmallestUnit: number, currency: string = "INR"): string {
  const code = (currency || "INR").toUpperCase();
  const locale = code === "INR" ? "en-IN" : "en-US";
  const majorUnitValue = amountInSmallestUnit / 100;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: majorUnitValue % 1 === 0 ? 0 : 2,
    }).format(majorUnitValue);
  } catch {
    return `${code} ${majorUnitValue.toFixed(2)}`;
  }
}
