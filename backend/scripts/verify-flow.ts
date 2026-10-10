import "dotenv/config";
import mongoose from "mongoose";
import request from "supertest";
import app from "../src/app";
import { User } from "../src/models/User";
import { CreditLedger } from "../src/models/CreditLedger";
import { Note } from "../src/models/Note";
import { Job } from "../src/models/Job";
import { signAccessToken } from "../src/middleware/authenticate";
import { getBalance } from "../src/services/credits";
import { generateNoteContent } from "../src/services/gemini";
import { confirmSpend, refundReserve } from "../src/services/credits";

async function verifyEndToEnd() {
  console.log("\n==================================================================");
  console.log("  MANUAL END-TO-END FLOW VERIFICATION ON MONGODB ATLAS");
  console.log("==================================================================\n");

  const uri = process.env.MONGODB_URI!;
  console.log("[1/6] Connecting to MongoDB Atlas cluster...");
  await mongoose.connect(uri);
  console.log("      Connected successfully.\n");

  // Step 1: Create or find test user
  console.log("[2/6] Setting up test user on Atlas...");
  const testEmail = "atlas_e2e_tester@studyforge.ai";
  let user = await User.findOne({ email: testEmail });
  if (!user) {
    user = await User.create({
      email: testEmail,
      googleId: "atlas_test_google_id_999",
      name: "Atlas E2E Tester",
    });
  }
  console.log(`      User ID: ${user._id}`);
  console.log(`      Email:   ${user.email}\n`);

  // Step 2: Seed credits
  console.log("[3/6] Ensuring credit balance on Atlas...");
  const initialBalance = await getBalance(user._id);
  if (initialBalance < 2) {
    await CreditLedger.create({
      userId: user._id,
      delta: 10,
      reason: "purchase",
      relatedId: "atlas_e2e_seed",
    });
    console.log(`      Added +10 purchase credits. New balance: ${await getBalance(user._id)} cr`);
  } else {
    console.log(`      Current balance on Atlas: ${initialBalance} cr`);
  }
  console.log();

  // Step 3: Hit POST /api/notes/generate via API
  console.log("[4/6] Executing POST /api/notes/generate with atomic reservation...");
  const authToken = signAccessToken(user._id.toString(), user.email);

  // Mock queue add in case Redis is not running locally during this verification
  const { noteQueue } = await import("../src/queues/noteQueue");
  noteQueue.add = (async (name: string, payload: any, opts: any) => {
    return { id: "mock_bull_job_atlas_test" } as any;
  }) as any;

  const res = await request(app)
    .post("/api/notes/generate")
    .set("Cookie", [`access_token=${authToken}`])
    .send({
      topic: "Distributed Systems: CAP Theorem and Consensus",
      difficulty: "medium",
    });

  console.log(`      API Response Status: HTTP ${res.status}`);
  console.log(`      API Response Body:  `, res.body);

  if (res.status !== 202) {
    throw new Error(`Generation API request failed with status ${res.status}: ${JSON.stringify(res.body)}`);
  }

  const { job_id: jobId, note_id: noteId } = res.body;

  // Step 4: Verify MongoDB Atlas records
  console.log("\n[5/6] Verifying records created in MongoDB Atlas collections...");
  const noteDoc = await Note.findById(noteId);
  const jobDoc = await Job.findById(jobId);
  const reserveEntry = await CreditLedger.findOne({ relatedId: jobId, reason: "reserve" });
  const midBalance = await getBalance(user._id);

  console.log(`      Note Document in Atlas:   ID=${noteDoc?._id}, Status=${noteDoc?.status}, Topic="${noteDoc?.topic}"`);
  console.log(`      Job Document in Atlas:    ID=${jobDoc?._id}, Status=${jobDoc?.status}, Type=${jobDoc?.type}`);
  console.log(`      CreditLedger in Atlas:    ID=${reserveEntry?._id}, Delta=${reserveEntry?.delta}, Reason=${reserveEntry?.reason}`);
  console.log(`      Balance after Reserve:    ${midBalance} cr\n`);

  // Step 5: Process Job (simulating worker lifecycle against Atlas)
  console.log("[6/6] Executing worker lifecycle for job against Atlas...");
  const ledgerReserveId = jobDoc!.payload.ledgerReserveId;

  try {
    console.log("      Attempting Gemini API call...");
    const geminiResponse = await generateNoteContent(
      jobDoc!.payload.topic,
      jobDoc!.payload.difficulty as any,
    );

    console.log("      Gemini API call succeeded! Saving completed note...");
    const diagrams = geminiResponse.diagrams.map((d) => ({
      id: d.id,
      type: d.type,
      title: d.title,
      data: typeof d.data === "string" ? d.data : JSON.stringify(d.data),
    }));

    await Note.findByIdAndUpdate(noteId, {
      status: "complete",
      content: geminiResponse.content,
      diagrams,
      questions: geminiResponse.questions,
    });

    // Convert reserve -> spend in ledger
    await confirmSpend(ledgerReserveId);
    await Job.findByIdAndUpdate(jobId, { status: "complete", result: { noteId } });
    console.log("      Converted 'reserve' -> 'spend' in CreditLedger.");
  } catch (err: any) {
    console.log(`      [Expected if no Gemini API Key] Gemini call failed: ${err.message}`);
    console.log("      Worker handling failure: Marking note/job failed & refunding reserved credits...");

    await Note.findByIdAndUpdate(noteId, { status: "failed" });
    await Job.findByIdAndUpdate(jobId, { status: "failed", error: err.message });
    await refundReserve(user._id, 2, jobId);
    console.log("      Created +2 'refund' entry in CreditLedger.");
  }

  // Final State Inspection from Atlas
  const finalNote = await Note.findById(noteId);
  const finalJob = await Job.findById(jobId);
  const finalBalance = await getBalance(user._id);
  const userLedger = await CreditLedger.find({ userId: user._id }).sort({ createdAt: -1 });

  console.log("\n==================================================================");
  console.log("  FINAL MONGODB ATLAS STATE CONFIRMATION");
  console.log("==================================================================");
  console.log(`  Note Final Status:   ${finalNote?.status}`);
  console.log(`  Job Final Status:    ${finalJob?.status}`);
  console.log(`  User Final Balance:  ${finalBalance} cr`);
  console.log("\n  CreditLedger History in Atlas:");
  userLedger.forEach((entry, idx) => {
    console.log(`    ${idx + 1}. [${entry.reason.toUpperCase().padEnd(8)}] Delta: ${entry.delta > 0 ? "+" : ""}${entry.delta} cr | RelatedId: ${entry.relatedId} | Date: ${entry.createdAt.toISOString()}`);
  });
  console.log("==================================================================\n");

  await mongoose.disconnect();
}

verifyEndToEnd().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});
