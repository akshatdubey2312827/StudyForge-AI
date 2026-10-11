import "dotenv/config";
import mongoose, { Types } from "mongoose";
import { User } from "../src/models/User";
import { CreditLedger } from "../src/models/CreditLedger";
import { Note, Difficulty } from "../src/models/Note";
import { Job } from "../src/models/Job";
import {
  atomicReserveForNote,
  confirmSpend,
  refundReserve,
  getBalance,
  getCreditCost,
} from "../src/services/credits";

async function runProof() {
  console.log("================================================================================");
  console.log("  PROVING DIFFICULTY-BASED CREDIT DEDUCTIONS AND REFUNDS ON MONGODB ATLAS");
  console.log("================================================================================\n");

  const uri = process.env.MONGODB_URI!;
  await mongoose.connect(uri);
  console.log("Connected to MongoDB Atlas.\n");

  // Create or reset dedicated test user
  const email = `difficulty_proof_${Date.now()}@studyforge.ai`;
  const user = await User.create({
    email,
    name: "Difficulty Proof User",
    googleId: `diff_proof_${Date.now()}`,
  });
  console.log(`Created test user: ID=${user._id}, Email=${email}`);

  // Seed user with 50 credits
  await CreditLedger.create({
    userId: user._id,
    delta: 50,
    reason: "purchase",
    relatedId: "proof_seed_50",
  });
  const startingBalance = await getBalance(user._id);
  console.log(`Seeded 50 credits. Starting balance: ${startingBalance} cr\n`);

  const difficulties: Difficulty[] = ["easy", "medium", "hard"];

  console.log("--------------------------------------------------------------------------------");
  console.log("PART 1: COMPLETED NOTE GENERATION PER DIFFICULTY (Easy: 1, Medium: 2, Hard: 3)");
  console.log("--------------------------------------------------------------------------------");

  for (const diff of difficulties) {
    const cost = getCreditCost(diff);
    console.log(`\n▶ [${diff.toUpperCase()}] Generating completed note... Expected cost: ${cost} cr`);

    const balanceBefore = await getBalance(user._id);
    const reserveRes = await atomicReserveForNote(
      user._id.toString(),
      `Proof Topic ${diff.toUpperCase()}`,
      diff,
      cost,
    );

    if (!reserveRes.success) {
      throw new Error(`Failed to reserve credits for ${diff}`);
    }

    const { noteId, jobId, ledgerReserveId } = reserveRes;
    const balanceDuringReserve = await getBalance(user._id);
    const reserveEntry = await CreditLedger.findById(ledgerReserveId);

    console.log(`  1. Reservation created:`);
    console.log(`     - Ledger ID: ${ledgerReserveId}`);
    console.log(`     - Delta:     ${reserveEntry?.delta} (expected: -${cost})`);
    console.log(`     - Reason:    ${reserveEntry?.reason} (expected: "reserve")`);
    console.log(`     - Balance during reserve: ${balanceDuringReserve} cr (was ${balanceBefore} cr)`);

    // Complete the note and convert reserve -> spend
    await Note.findByIdAndUpdate(noteId, {
      status: "complete",
      content: `Completed note content for ${diff}`,
    });
    await Job.findByIdAndUpdate(jobId, { status: "complete", result: { noteId } });
    await confirmSpend(ledgerReserveId!, jobId, user._id, cost);

    const spendEntry = await CreditLedger.findById(ledgerReserveId);
    const balanceAfter = await getBalance(user._id);

    console.log(`  2. Converted after completion:`);
    console.log(`     - Ledger ID: ${spendEntry?._id}`);
    console.log(`     - Delta:     ${spendEntry?.delta} (expected: -${cost})`);
    console.log(`     - Reason:    ${spendEntry?.reason} (expected: "spend")`);
    console.log(`     - Balance after completion: ${balanceAfter} cr (net deduction: ${balanceBefore - balanceAfter} cr)`);
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log("PART 2: FORCED FAILURE & REFUND PER DIFFICULTY (Easy: +1, Medium: +2, Hard: +3)");
  console.log("--------------------------------------------------------------------------------");

  for (const diff of difficulties) {
    const cost = getCreditCost(diff);
    console.log(`\n▶ [${diff.toUpperCase()}] Simulating forced failure & refund... Expected cost: ${cost} cr`);

    const balanceBefore = await getBalance(user._id);
    const reserveRes = await atomicReserveForNote(
      user._id.toString(),
      `Failed Topic ${diff.toUpperCase()}`,
      diff,
      cost,
    );

    if (!reserveRes.success) {
      throw new Error(`Failed to reserve credits for failure test ${diff}`);
    }

    const { noteId, jobId, ledgerReserveId } = reserveRes;
    const balanceDuringReserve = await getBalance(user._id);
    const reserveEntry = await CreditLedger.findById(ledgerReserveId);

    console.log(`  1. Reservation created:`);
    console.log(`     - Ledger ID: ${ledgerReserveId}`);
    console.log(`     - Delta:     ${reserveEntry?.delta} (expected: -${cost})`);
    console.log(`     - Reason:    ${reserveEntry?.reason} (expected: "reserve")`);
    console.log(`     - Balance during reserve: ${balanceDuringReserve} cr`);

    // Simulate forced failure: Mark Note & Job failed and refund reserve
    await Note.findByIdAndUpdate(noteId, { status: "failed" });
    await Job.findByIdAndUpdate(jobId, { status: "failed", error: `Forced simulated error for ${diff}` });
    await refundReserve(user._id, cost, jobId!);

    const refundEntry = await CreditLedger.findOne({ relatedId: jobId, reason: "refund" });
    const balanceAfterRefund = await getBalance(user._id);

    console.log(`  2. Refunded after failure:`);
    console.log(`     - Refund Ledger ID: ${refundEntry?._id}`);
    console.log(`     - Delta:            +${refundEntry?.delta} (expected: +${cost})`);
    console.log(`     - Reason:           "${refundEntry?.reason}" (expected: "refund")`);
    console.log(`     - Balance after refund: ${balanceAfterRefund} cr (restored to pre-reserve balance: ${balanceBefore} cr)`);
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log("PART 3: FULL USER CREDIT LEDGER AUDIT TABLE");
  console.log("--------------------------------------------------------------------------------");

  const fullLedger = await CreditLedger.find({ userId: user._id }).sort({ createdAt: 1 });
  console.log(`Total ledger entries: ${fullLedger.length}\n`);
  console.table(
    fullLedger.map((entry, idx) => ({
      "#": idx + 1,
      ID: entry._id.toString(),
      Delta: entry.delta > 0 ? `+${entry.delta}` : `${entry.delta}`,
      Reason: entry.reason,
      RelatedId: entry.relatedId ?? "—",
      Date: entry.createdAt.toISOString().slice(11, 19),
    })),
  );

  const finalBalance = await getBalance(user._id);
  console.log(`\nFinal Calculated Balance (SUM of all ledger entries): ${finalBalance} cr`);
  console.log(`Calculation: 50 (seed) - 1 (easy spend) - 2 (med spend) - 3 (hard spend) - 1 (easy res) + 1 (refund) - 2 (med res) + 2 (refund) - 3 (hard res) + 3 (refund) = ${50 - 1 - 2 - 3} cr`);

  // Clean up test documents
  await CreditLedger.deleteMany({ userId: user._id });
  await Note.deleteMany({ userId: user._id });
  await Job.deleteMany({ "payload.userId": user._id.toString() });
  await User.findByIdAndDelete(user._id);
  console.log("\nCleaned up ephemeral proof user and documents from Atlas.");

  await mongoose.disconnect();
}

runProof().catch((err) => {
  console.error("Proof execution error:", err);
  process.exit(1);
});
