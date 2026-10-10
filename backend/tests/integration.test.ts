import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";

// Set environment variables before any imports
const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_idempotency_validation_123";
process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_testing";
process.env.JWT_ACCESS_SECRET = "test_access_secret_64_characters_long_for_hmac_sha256_hashing_key!!";
process.env.CREDITS_PER_NOTE = "2";

// Import app and dependencies
import app from "../src/app";
import { User } from "../src/models/User";
import { CreditLedger } from "../src/models/CreditLedger";
import { Transaction } from "../src/models/Transaction";
import { Note } from "../src/models/Note";
import { Job } from "../src/models/Job";
import { signAccessToken } from "../src/middleware/authenticate";
import { noteQueue } from "../src/queues/noteQueue";
import { stripe } from "../src/services/stripe";

async function runTests() {
  console.log("\n=======================================================");
  console.log("  RUNNING BACKEND SAFETY-CRITICAL INTEGRATION TESTS");
  console.log("=======================================================\n");

  let replSet: MongoMemoryReplSet | null = null;

  try {
    console.log("[Setup] Starting in-memory MongoDB replica set (v6.0.19)...");
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: { version: "6.0.19" },
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);
    console.log("[Setup] Connected to in-memory MongoDB replica set.\n");

    // Mock BullMQ queue.add
    let mockJobCounter = 1;
    noteQueue.add = async (name: string, payload: any, opts: any) => {
      return { id: `mock_bull_job_${mockJobCounter++}` } as any;
    };

    // =========================================================================
    // TEST 1: Concurrent Credit Reservation Race Condition
    // =========================================================================
    console.log("-------------------------------------------------------");
    console.log("TEST 1 — Concurrent Credit Reservation Race Condition");
    console.log("-------------------------------------------------------");

    // 1. Create a test user
    const raceUser = await User.create({
      email: "racetest@example.com",
      googleId: "google_race_12345",
      name: "Race Condition Tester",
    });

    // 2. Seed with exactly 2 credits (cost for 1 note = 2 credits)
    await CreditLedger.create({
      userId: raceUser._id,
      delta: 2,
      reason: "purchase",
      relatedId: "initial_test_seed",
    });

    const initialBalance = await getLedgerBalance(raceUser._id);
    console.log(`[Test 1] User created: ${raceUser.email} with initial balance = ${initialBalance} cr`);

    const authToken = signAccessToken(raceUser._id.toString(), raceUser.email);

    // 3. Fire TWO simultaneous POST /api/notes/generate requests using Promise.all
    console.log("[Test 1] Firing 2 simultaneous POST /api/notes/generate requests concurrently...");
    
    const [res1, res2] = await Promise.all([
      request(app)
        .post("/api/notes/generate")
        .set("Cookie", [`access_token=${authToken}`])
        .send({ topic: "Advanced Quantum Computing", difficulty: "hard" }),
      request(app)
        .post("/api/notes/generate")
        .set("Cookie", [`access_token=${authToken}`])
        .send({ topic: "Advanced Quantum Computing", difficulty: "hard" }),
    ]);

    console.log(`[Test 1] Request 1 Response: HTTP ${res1.status}`, res1.body);
    console.log(`[Test 1] Request 2 Response: HTTP ${res2.status}`, res2.body);

    const statuses = [res1.status, res2.status].sort();
    const finalBalance = await getLedgerBalance(raceUser._id);
    const reserveEntries = await CreditLedger.find({ userId: raceUser._id, reason: "reserve" });
    const notesCount = await Note.countDocuments({ userId: raceUser._id });
    const jobsCount = await Job.countDocuments({ "payload.userId": raceUser._id.toString() });

    console.log(`[Test 1] Results Summary:`);
    console.log(`         - Status codes: [${statuses.join(", ")}] (Expected: [202, 402])`);
    console.log(`         - Final balance: ${finalBalance} cr (Expected: 0 cr, NOT negative)`);
    console.log(`         - Total 'reserve' entries: ${reserveEntries.length} (Expected: exactly 1)`);
    console.log(`         - Notes created: ${notesCount} (Expected: 1)`);
    console.log(`         - Jobs created: ${jobsCount} (Expected: 1)`);

    const test1Passed =
      statuses[0] === 202 &&
      statuses[1] === 402 &&
      finalBalance === 0 &&
      reserveEntries.length === 1 &&
      notesCount === 1;

    if (test1Passed) {
      console.log("\n>>> TEST 1 RESULT: PASSED ✅ (No double-spend occurred)\n");
    } else {
      console.log("\n>>> TEST 1 RESULT: FAILED ❌ (Race condition detected / double-spent)\n");
    }

    // =========================================================================
    // TEST 2: Stripe Webhook Idempotency
    // =========================================================================
    console.log("-------------------------------------------------------");
    console.log("TEST 2 — Stripe Webhook Idempotency");
    console.log("-------------------------------------------------------");

    // 1. Create a test user for webhook
    const stripeUser = await User.create({
      email: "stripeuser@example.com",
      googleId: "google_stripe_67890",
      name: "Stripe Webhook Tester",
    });

    const fixedPaymentIntentId = "pi_test_idempotency_fixed_998877";

    const webhookEvent = {
      id: "evt_test_idempotency_001",
      object: "event",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: fixedPaymentIntentId,
          object: "payment_intent",
          amount: 499,
          currency: "usd",
          metadata: {
            userId: stripeUser._id.toString(),
            package: "starter",
            credits: "50",
          },
        },
      },
    };

    const rawPayload = JSON.stringify(webhookEvent);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: rawPayload,
      secret: TEST_WEBHOOK_SECRET,
    });

    // 2. FIRST Webhook Call
    console.log("[Test 2] Dispatching FIRST webhook call with paymentIntent:", fixedPaymentIntentId);
    const webhookRes1 = await request(app)
      .post("/api/billing/webhook")
      .set("stripe-signature", signature)
      .set("Content-Type", "application/json")
      .send(rawPayload);

    console.log(`[Test 2] First Call Response: HTTP ${webhookRes1.status}`, webhookRes1.body);

    const txCount1 = await Transaction.countDocuments({ stripePaymentIntentId: fixedPaymentIntentId });
    const purchaseEntries1 = await CreditLedger.find({ userId: stripeUser._id, reason: "purchase" });
    const balanceAfterCall1 = await getLedgerBalance(stripeUser._id);

    console.log(`[Test 2] After Call 1:`);
    console.log(`         - Transactions: ${txCount1} (Expected: 1)`);
    console.log(`         - Purchase entries: ${purchaseEntries1.length} (Expected: 1)`);
    console.log(`         - Balance: ${balanceAfterCall1} cr (Expected: 50 cr)`);

    // 3. SECOND Webhook Call (Identical payload)
    console.log("[Test 2] Dispatching SECOND webhook call with duplicate paymentIntent:", fixedPaymentIntentId);
    const webhookRes2 = await request(app)
      .post("/api/billing/webhook")
      .set("stripe-signature", signature)
      .set("Content-Type", "application/json")
      .send(rawPayload);

    console.log(`[Test 2] Second Call Response: HTTP ${webhookRes2.status}`, webhookRes2.body);

    const txCount2 = await Transaction.countDocuments({ stripePaymentIntentId: fixedPaymentIntentId });
    const purchaseEntries2 = await CreditLedger.find({ userId: stripeUser._id, reason: "purchase" });
    const balanceAfterCall2 = await getLedgerBalance(stripeUser._id);

    console.log(`[Test 2] After Call 2:`);
    console.log(`         - Transactions: ${txCount2} (Expected: 1, no duplicate transaction created)`);
    console.log(`         - Purchase entries: ${purchaseEntries2.length} (Expected: 1, no duplicate credits added)`);
    console.log(`         - Balance: ${balanceAfterCall2} cr (Expected: 50 cr, NOT 100 cr)`);
    console.log(`         - HTTP Status: ${webhookRes2.status} (Expected: 200 OK for Stripe)`);

    const test2Passed =
      webhookRes1.status === 200 &&
      webhookRes2.status === 200 &&
      txCount2 === 1 &&
      purchaseEntries2.length === 1 &&
      balanceAfterCall2 === 50;

    if (test2Passed) {
      console.log("\n>>> TEST 2 RESULT: PASSED ✅ (Webhook is idempotent)\n");
    } else {
      console.log("\n>>> TEST 2 RESULT: FAILED ❌ (Duplicate payment processed)\n");
    }

    console.log("=======================================================");
    console.log(`  OVERALL TEST RESULTS: ${test1Passed && test2Passed ? "ALL TESTS PASSED ✅" : "SOME TESTS FAILED ❌"}`);
    console.log("=======================================================\n");

    process.exit(test1Passed && test2Passed ? 0 : 1);
  } catch (err) {
    console.error("[Test Runner Error]:", err);
    process.exit(1);
  } finally {
    if (replSet) {
      await mongoose.disconnect();
      await replSet.stop();
    }
  }
}

async function getLedgerBalance(userId: mongoose.Types.ObjectId): Promise<number> {
  const result = await CreditLedger.aggregate([
    { $match: { userId } },
    { $group: { _id: null, balance: { $sum: "$delta" } } },
  ]);
  return result[0]?.balance ?? 0;
}

runTests();
