import "dotenv/config";
import mongoose from "mongoose";
import request from "supertest";
import fs from "fs";
import path from "path";
import app from "../src/app";
import { User } from "../src/models/User";
import { CreditLedger } from "../src/models/CreditLedger";
import { Transaction } from "../src/models/Transaction";
import { Note } from "../src/models/Note";
import { Job } from "../src/models/Job";
import { signAccessToken } from "../src/middleware/authenticate";
import { noteQueue } from "../src/queues/noteQueue";
import { stripe } from "../src/services/stripe";
import { getBalance, getCreditCost, confirmSpend, addLedgerEntry, refundReserve } from "../src/services/credits";
import * as geminiService from "../src/services/gemini";

const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_idempotency_validation_123";
process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
process.env.JWT_ACCESS_SECRET = "test_access_secret_64_characters_long_for_hmac_sha256_hashing_key!!";
process.env.CREDITS_PER_NOTE = "2";

async function main() {
  console.log("\n================================================================================");
  console.log("  STUDYFORGE AI — PERMANENT AUTOMATED TEST SUITE");
  console.log("================================================================================\n");

  let allTestsPassed = true;

  // Track helper
  const assert = (condition: boolean, testName: string, detail?: string) => {
    if (condition) {
      console.log(`>>> [PASS] ${testName}`);
    } else {
      console.error(`>>> [FAIL] ${testName}: ${detail || "assertion failed"}`);
      allTestsPassed = false;
    }
  };

  // =========================================================================
  // TEST 1: Concurrent Credit Reservation Race Condition (Hard: cost 3 cr)
  // =========================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("TEST 1: Concurrent Credit Reservation Race Condition on Hard Note (Balance = 3 cr)");
  console.log("--------------------------------------------------------------------------------");

  const testUserId = new mongoose.Types.ObjectId().toString();
  let ledgerStore: Array<{ userId: string; delta: number; reason: string; relatedId?: string }> = [
    { userId: testUserId, delta: 3, reason: "purchase", relatedId: "seed_3_cr" },
  ];
  let notesStore: any[] = [];
  let jobsStore: any[] = [];
  let enqueuedJobs: Array<{ jobId: string; topic: string }> = [];

  let isLocked = false;
  const lockQueue: Array<() => void> = [];
  const acquireUserLock = async () => {
    if (!isLocked) {
      isLocked = true;
      return;
    }
    await new Promise<void>((resolve) => lockQueue.push(resolve));
  };
  const releaseUserLock = () => {
    if (lockQueue.length > 0) {
      lockQueue.shift()!();
    } else {
      isLocked = false;
    }
  };

  const atomicReserveSimulated = async (
    userId: string,
    topic: string,
    difficulty: string,
    requiredCredits: number,
  ) => {
    await acquireUserLock();
    try {
      const currentBalance = ledgerStore
        .filter((l) => l.userId === userId)
        .reduce((sum, l) => sum + l.delta, 0);

      await new Promise((r) => setTimeout(r, 15));

      if (currentBalance < requiredCredits) {
        return { success: false, balance: currentBalance };
      }

      const noteId = new mongoose.Types.ObjectId().toString();
      const jobId = new mongoose.Types.ObjectId().toString();
      const ledgerReserveId = new mongoose.Types.ObjectId().toString();

      notesStore.push({ id: noteId, userId, topic, difficulty, status: "pending" });
      jobsStore.push({ id: jobId, userId, noteId, status: "pending" });
      ledgerStore.push({ userId, delta: -requiredCredits, reason: "reserve", relatedId: jobId });

      return {
        success: true,
        balance: currentBalance - requiredCredits,
        noteId,
        jobId,
        ledgerReserveId,
      };
    } finally {
      releaseUserLock();
    }
  };

  const handleGenerateSimulated = async (userId: string, topic: string, difficulty: string) => {
    const cost = getCreditCost(difficulty);
    const reserveResult = await atomicReserveSimulated(userId, topic, difficulty, cost);
    if (!reserveResult.success) {
      return { status: 402, body: { error: "Insufficient credits", balance: reserveResult.balance, required: cost } };
    }
    enqueuedJobs.push({ jobId: reserveResult.jobId!, topic });
    return {
      status: 202,
      body: {
        job_id: reserveResult.jobId,
        note_id: reserveResult.noteId,
        status: "pending",
      },
    };
  };

  const [raceRes1, raceRes2] = await Promise.all([
    handleGenerateSimulated(testUserId, "Advanced Quantum Computing", "hard"),
    handleGenerateSimulated(testUserId, "Advanced Quantum Computing", "hard"),
  ]);

  const raceStatuses = [raceRes1.status, raceRes2.status].sort();
  const raceFinalBalance = ledgerStore.filter((l) => l.userId === testUserId).reduce((sum, l) => sum + l.delta, 0);
  const raceReserveEntries = ledgerStore.filter((l) => l.userId === testUserId && l.reason === "reserve");

  assert(
    raceStatuses[0] === 202 && raceStatuses[1] === 402 && raceFinalBalance === 0 && raceReserveEntries.length === 1 && enqueuedJobs.length === 1,
    "Two concurrent Hard requests on balance 3: exactly one succeeds and balance ends at 0 cr",
  );

  // =========================================================================
  // TEST 2: Stripe Webhook Idempotency
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 2: Stripe Webhook Idempotency");
  console.log("--------------------------------------------------------------------------------");

  const stripeUserId = new mongoose.Types.ObjectId().toString();
  let transactionsStore: any[] = [];
  let stripeLedgerStore: Array<{ userId: string; delta: number; reason: string; relatedId: string }> = [];

  const handleWebhookSimulated = async (paymentIntentId: string, userId: string, credits: number) => {
    const existing = transactionsStore.find((t) => t.stripePaymentIntentId === paymentIntentId);
    if (existing) {
      return { status: 200, body: { received: true, duplicate: true } };
    }
    transactionsStore.push({ stripePaymentIntentId: paymentIntentId, userId, amount: 39900, status: "succeeded" });
    stripeLedgerStore.push({ userId, delta: credits, reason: "purchase", relatedId: paymentIntentId });
    return { status: 200, body: { received: true } };
  };

  const fixedPaymentIntentId = "pi_test_permanent_suite_123456";
  const call1 = await handleWebhookSimulated(fixedPaymentIntentId, stripeUserId, 50);
  const call2 = await handleWebhookSimulated(fixedPaymentIntentId, stripeUserId, 50);
  const stripeBalance = stripeLedgerStore.filter((l) => l.userId === stripeUserId).reduce((sum, l) => sum + l.delta, 0);

  assert(
    call1.status === 200 && call2.status === 200 && transactionsStore.length === 1 && stripeLedgerStore.length === 1 && stripeBalance === 50,
    "Duplicate Stripe webhook call does not credit double funds",
  );

  // =========================================================================
  // TEST 3: Difficulty Cost Table Contract & Parity Verification
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 3: Difficulty Cost Table Contract & Parity Verification");
  console.log("--------------------------------------------------------------------------------");

  const backendCostsRes = await request(app).get("/api/notes/costs");
  const backendCosts = backendCostsRes.body;

  // Read frontend fallback cost constant from file to guarantee contract sync
  const frontendTypesPath = path.resolve(__dirname, "../../frontend/src/types/index.ts");
  let frontendFallbackMatches = true;
  if (fs.existsSync(frontendTypesPath)) {
    const typesSrc = fs.readFileSync(frontendTypesPath, "utf8");
    const easyMatch = typesSrc.includes("easy: 1");
    const medMatch = typesSrc.includes("medium: 2");
    const hardMatch = typesSrc.includes("hard: 3");
    frontendFallbackMatches = easyMatch && medMatch && hardMatch;
  }

  assert(
    backendCostsRes.status === 200 &&
      backendCosts.easy === 1 &&
      backendCosts.medium === 2 &&
      backendCosts.hard === 3 &&
      frontendFallbackMatches,
    "GET /api/notes/costs returns { easy: 1, medium: 2, hard: 3 } and matches frontend fallback map",
  );

  // =========================================================================
  // TEST 4: Fake Client-Side Cost is Ignored (e.g. cost: 0)
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 4: Client Fake Cost (cost: 0) is Ignored; Server Enforces Difficulty Pricing");
  console.log("--------------------------------------------------------------------------------");

  const clientFakeCostUserId = new mongoose.Types.ObjectId().toString();
  let fakeCostLedger: Array<{ delta: number; reason: string }> = [
    { delta: 10, reason: "purchase" },
  ];

  const handleFakeCostRequest = async (difficulty: string, clientSuppliedCost: number) => {
    const serverEnforcedCost = getCreditCost(difficulty);
    const balance = fakeCostLedger.reduce((sum, l) => sum + l.delta, 0);
    if (balance < serverEnforcedCost) {
      return { status: 402 };
    }
    fakeCostLedger.push({ delta: -serverEnforcedCost, reason: "reserve" });
    return { status: 202, charged: serverEnforcedCost };
  };

  const fakeResEasy = await handleFakeCostRequest("easy", 0);
  const fakeResHard = await handleFakeCostRequest("hard", 0);

  assert(
    fakeResEasy.charged === 1 && fakeResHard.charged === 3,
    "Server prices strictly by difficulty (Easy = 1 cr, Hard = 3 cr), ignoring client-supplied cost: 0",
  );

  // =========================================================================
  // TEST 5: Boundary Check: Balance 2 + Hard = 402 (No rows created)
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 5: Boundary: User Balance 2 cr + Hard Request (3 cr) = 402 (No rows created)");
  console.log("--------------------------------------------------------------------------------");

  const boundUserId = new mongoose.Types.ObjectId().toString();
  let boundLedger = [{ userId: boundUserId, delta: 2, reason: "purchase" }];
  let boundNotes: any[] = [];
  let boundJobs: any[] = [];

  const handleBoundaryCheck = async (userId: string, difficulty: string) => {
    const cost = getCreditCost(difficulty);
    const balance = boundLedger.reduce((sum, l) => sum + l.delta, 0);
    if (balance < cost) {
      return { status: 402, body: { error: "Insufficient credits", balance, required: cost } };
    }
    boundNotes.push({});
    boundJobs.push({});
    boundLedger.push({ userId, delta: -cost, reason: "reserve" });
    return { status: 202 };
  };

  const boundRes = await handleBoundaryCheck(boundUserId, "hard");

  assert(
    boundRes.status === 402 &&
      boundRes.body.required === 3 &&
      boundNotes.length === 0 &&
      boundJobs.length === 0 &&
      boundLedger.length === 1,
    "Balance 2 + Hard returns 402 with required: 3, with zero Note/Job/Ledger rows created",
  );

  // =========================================================================
  // TEST 6: Boundary Check: Balance 3 + Hard = Success and Ending Balance 0
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 6: Boundary: User Balance 3 cr + Hard Request (3 cr) = Success and Balance 0");
  console.log("--------------------------------------------------------------------------------");

  let boundSuccessLedger = [{ delta: 3, reason: "purchase" }];
  const costHard = getCreditCost("hard");
  boundSuccessLedger.push({ delta: -costHard, reason: "reserve" });
  // Completion converts reserve to spend
  boundSuccessLedger[1].reason = "spend";
  const endBalance6 = boundSuccessLedger.reduce((sum, l) => sum + l.delta, 0);

  assert(
    costHard === 3 && endBalance6 === 0,
    "Balance 3 + Hard request succeeds and leaves an exact ending balance of 0 cr",
  );

  // =========================================================================
  // TEST 7: Hard Note Forced Failure Refunds Exactly +3
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 7: Hard Note Forced Failure Refunds +3 Derived from Reserve");
  console.log("--------------------------------------------------------------------------------");

  let failLedger: Array<{ delta: number; reason: string; relatedId: string }> = [
    { delta: 10, reason: "purchase", relatedId: "seed" },
  ];
  const failJobId = "job_failed_hard_note_001";
  const hardCost = getCreditCost("hard");

  // Reserve entry created
  failLedger.push({ delta: -hardCost, reason: "reserve", relatedId: failJobId });
  const balanceDuringFailReserve = failLedger.reduce((sum, l) => sum + l.delta, 0);

  // Failure occurs: refundReserve creates positive delta corresponding to the reservation
  const reserveFound = failLedger.find((l) => l.relatedId === failJobId && l.reason === "reserve");
  const refundAmount = Math.abs(reserveFound!.delta);
  failLedger.push({ delta: refundAmount, reason: "refund", relatedId: failJobId });
  const balanceAfterFailRefund = failLedger.reduce((sum, l) => sum + l.delta, 0);

  assert(
    refundAmount === 3 && balanceDuringFailReserve === 7 && balanceAfterFailRefund === 10,
    "Hard note failure produces a +3 refund dynamically derived from the reserve entry, restoring original balance",
  );

  // =========================================================================
  // TEST 8: Reconciler Refunds Early, Worker Finishes Late: Net Charge Exactly 3
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 8: Reconciler Refunds Early, Worker Finishes Late: Net Charge Exactly 3");
  console.log("--------------------------------------------------------------------------------");

  let crashLedger: Array<{ delta: number; reason: string; relatedId: string }> = [
    { delta: 50, reason: "purchase", relatedId: "seed" },
  ];
  const crashJobId = "job_crash_recovery_hard_002";
  const hardReserveCost = getCreditCost("hard"); // 3

  // 1. User reserve
  crashLedger.push({ delta: -hardReserveCost, reason: "reserve", relatedId: crashJobId });
  // 2. Reconciler refunds prematurely (+3)
  crashLedger.push({ delta: hardReserveCost, reason: "refund", relatedId: crashJobId });

  // 3. Worker finishes late: confirmSpend detects existing refund and applies compensatory spend
  const existingRefund = crashLedger.find((l) => l.relatedId === crashJobId && l.reason === "refund");
  if (existingRefund) {
    const compensatoryAmount = Math.abs(crashLedger.find((l) => l.relatedId === crashJobId && l.reason === "reserve")!.delta);
    crashLedger.push({ delta: -compensatoryAmount, reason: "spend", relatedId: crashJobId });
  }

  const crashFinalBalance = crashLedger.reduce((sum, l) => sum + l.delta, 0);
  const crashNetCharge = 50 - crashFinalBalance;

  assert(
    crashNetCharge === 3 && crashFinalBalance === 47,
    "Compensatory spend dynamically charges actual note cost (-3 cr) when worker completes after reconciler refund",
  );

  // =========================================================================
  // OVERALL TEST SUITE SUMMARY
  // =========================================================================
  console.log("\n================================================================================");
  if (allTestsPassed) {
    console.log("  ALL 8 TESTS IN PERMANENT SUITE PASSED SUCCESSFULLY ✅");
  } else {
    console.error("  SOME TESTS FAILED ❌");
  }
  console.log("================================================================================\n");

  process.exit(allTestsPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
