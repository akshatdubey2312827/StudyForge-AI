import mongoose, { Types } from "mongoose";
import { CreditLedger, type LedgerReason } from "../models/CreditLedger";
import { User } from "../models/User";
import { Note } from "../models/Note";
import { Job } from "../models/Job";

export const DIFFICULTY_CREDIT_COST: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export function getCreditCost(difficulty?: string): number {
  if (!difficulty) return 2;
  return DIFFICULTY_CREDIT_COST[difficulty.toLowerCase()] ?? 2;
}

/**
 * Get the current credit balance for a user.
 * Balance = SUM of all delta values in CreditLedger for this user.
 * This is the ONLY source of truth — never use a standalone counter.
 */
export async function getBalance(userId: Types.ObjectId | string): Promise<number> {
  const uId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;
  const result = await CreditLedger.aggregate([
    { $match: { userId: uId } },
    { $group: { _id: null, balance: { $sum: "$delta" } } },
  ]);
  return result[0]?.balance ?? 0;
}

/**
 * Add a ledger entry. Returns the created entry's _id.
 */
export async function addLedgerEntry(
  userId: Types.ObjectId | string,
  delta: number,
  reason: LedgerReason,
  relatedId?: string,
): Promise<string> {
  const entry = await CreditLedger.create({
    userId,
    delta,
    reason,
    relatedId,
  });
  return entry._id.toString();
}

/**
 * Atomic check-and-reserve for note generation.
 *
 * Runs inside a MongoDB session transaction and locks the User document
 * to serialize concurrent generation requests for the same user.
 * Guarantees that two concurrent requests cannot double-spend.
 */
export interface AtomicReserveResult {
  success: boolean;
  balance: number;
  noteId?: string;
  jobId?: string;
  ledgerReserveId?: string;
}

export async function atomicReserveForNote(
  userId: string,
  sanitizedTopic: string,
  difficulty: string,
  requiredCredits: number,
): Promise<AtomicReserveResult> {
  const uId = new Types.ObjectId(userId);
  const session = await mongoose.startSession();

  try {
    let result: AtomicReserveResult = { success: false, balance: 0 };

    await session.withTransaction(async () => {
      // 1. Lock the user document within this transaction to serialize concurrent attempts
      const user = await User.findOneAndUpdate(
        { _id: uId },
        { $inc: { __v: 1 } },
        { session, new: true },
      );

      if (!user) {
        throw new Error("User not found");
      }

      // 2. Compute current balance within transaction snapshot
      const agg = await CreditLedger.aggregate([
        { $match: { userId: uId } },
        { $group: { _id: null, balance: { $sum: "$delta" } } },
      ]).session(session);

      const currentBalance = agg[0]?.balance ?? 0;

      if (currentBalance < requiredCredits) {
        result = { success: false, balance: currentBalance };
        return; // Aborts write actions in transaction cleanly
      }

      const noteId = new Types.ObjectId();
      const jobId = new Types.ObjectId();
      const ledgerReserveId = new Types.ObjectId();

      // 3. Create Note inside transaction
      const [note] = await Note.create(
        [
          {
            _id: noteId,
            userId: uId,
            topic: sanitizedTopic,
            difficulty,
            status: "pending",
          },
        ],
        { session },
      );

      // 4. Create CreditLedger reserve entry inside transaction
      const [ledgerEntry] = await CreditLedger.create(
        [
          {
            _id: ledgerReserveId,
            userId: uId,
            delta: -requiredCredits,
            reason: "reserve",
            relatedId: jobId.toString(),
          },
        ],
        { session },
      );

      // 5. Create Job inside transaction with ledgerReserveId populated
      const [jobDoc] = await Job.create(
        [
          {
            _id: jobId,
            type: "generate-note",
            status: "pending",
            payload: {
              userId,
              noteId: noteId.toString(),
              topic: sanitizedTopic,
              difficulty,
              ledgerReserveId: ledgerReserveId.toString(),
            },
            attempts: 0,
          },
        ],
        { session },
      );

      result = {
        success: true,
        balance: currentBalance - requiredCredits,
        noteId: noteId.toString(),
        jobId: jobId.toString(),
        ledgerReserveId: ledgerReserveId.toString(),
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * On job success: mark the reserve entry as "spend".
 *
 * Verifies that the reservation was not already refunded by the reconciler.
 * If the reconciler already issued a refund during extreme latency,
 * this function inserts a new "spend" delta so the delivered note is
 * properly accounted for and never free.
 */
export async function confirmSpend(
  ledgerEntryId: string,
  jobId?: string,
  userId?: Types.ObjectId | string,
  amount = 2,
): Promise<void> {
  // 1. Check if a refund was already created for this job
  if (jobId && userId) {
    const existingRefund = await CreditLedger.findOne({
      userId: typeof userId === "string" ? new Types.ObjectId(userId) : userId,
      reason: "refund",
      relatedId: jobId,
    });

    if (existingRefund) {
      // Reconciler refunded prematurely; deduct the spend so user is correctly charged for the delivered note
      console.warn(
        `[Credits] Job ${jobId} completed after reconciler refunded it. Applying compensatory spend.`,
      );
      await addLedgerEntry(userId, -amount, "spend", jobId);
      return;
    }
  }

  // 2. Atomically convert reserve -> spend
  await CreditLedger.findOneAndUpdate(
    { _id: new Types.ObjectId(ledgerEntryId), reason: "reserve" },
    { reason: "spend" },
  );
}

/**
 * On job failure: create a refund entry to restore the reserved credits.
 */
export async function refundReserve(
  userId: Types.ObjectId | string,
  amount: number,
  jobId: string,
): Promise<void> {
  await addLedgerEntry(userId, amount, "refund", jobId);
}

/**
 * Add credits from a purchase (called only from Stripe webhook).
 */
export async function addPurchaseCredits(
  userId: Types.ObjectId | string,
  credits: number,
  paymentIntentId: string,
): Promise<void> {
  await addLedgerEntry(userId, credits, "purchase", paymentIntentId);
}
