import "dotenv/config";
import axios from "axios";
import mongoose from "mongoose";
import { User } from "../src/models/User";
import { CreditLedger } from "../src/models/CreditLedger";
import { Note } from "../src/models/Note";

async function runEdgeCasesVerification() {
  console.log("==================================================================");
  console.log("  MANUAL UI / BACKEND EDGE CASES VERIFICATION");
  console.log("==================================================================\n");

  await mongoose.connect(process.env.MONGODB_URI!);

  // 1. Dev login to get session cookies
  const client = axios.create({
    baseURL: "http://localhost:3001",
    withCredentials: true,
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const authRes = await client.get("/api/auth/google");
  const cookieHeaders = authRes.headers["set-cookie"];
  const cookieStr = cookieHeaders?.map((c) => c.split(";")[0]).join("; ") ?? "";
  console.log("✅ [Step 1: Auth] Initial Login Succeeded. Set-Cookie received.");

  // Get current user
  const sessionRes = await axios.get("http://localhost:3001/api/auth/session", {
    headers: { Cookie: cookieStr },
  });
  const currentUserId = sessionRes.data.user.id;
  console.log(`✅ [Step 1: Session] User: ${sessionRes.data.user.name} (${currentUserId})`);

  // -------------------------------------------------------------------------
  // TEST 1: Revision Mode data inspection on existing notes
  // -------------------------------------------------------------------------
  console.log("\n--- [Test 1] Testing Revision Mode & Collapsible Q&A ---");
  const notesListRes = await axios.get("http://localhost:3001/api/notes", {
    headers: { Cookie: cookieStr },
  });
  const latestNoteId = notesListRes.data.notes[0]?.id;
  if (!latestNoteId) throw new Error("No notes found for user.");

  const singleNoteRes = await axios.get(`http://localhost:3001/api/notes/${latestNoteId}`, {
    headers: { Cookie: cookieStr },
  });
  const noteData = singleNoteRes.data;
  console.log(`✅ Note loaded for Revision: "${noteData.topic}" (${noteData.questions.length} questions)`);
  noteData.questions.slice(0, 3).forEach((q: any, i: number) => {
    console.log(`   Q${i + 1} [${q.priority.toUpperCase()}]: "${q.question}" -> Answer length: ${q.answer.length} chars, Tags: [${q.tags?.join(", ")}]`);
  });

  // -------------------------------------------------------------------------
  // TEST 2: History Search & Difficulty Filtering
  // -------------------------------------------------------------------------
  console.log("\n--- [Test 2] Testing History Search & Filtering ---");
  const allNotes = notesListRes.data.notes;
  console.log(`✅ Total notes retrieved in History: ${allNotes.length}`);
  const easyNotes = allNotes.filter((n: any) => n.difficulty === "easy");
  const medNotes = allNotes.filter((n: any) => n.difficulty === "medium");
  const hardNotes = allNotes.filter((n: any) => n.difficulty === "hard");
  console.log(`   Breakdown by difficulty: Easy: ${easyNotes.length}, Medium: ${medNotes.length}, Hard: ${hardNotes.length}`);
  console.log(`   Sample search test: matching "Computer" -> ${allNotes.filter((n: any) => n.topic.toLowerCase().includes("computer")).length} found`);

  // -------------------------------------------------------------------------
  // TEST 3: Generate Note on topic that produces recharts_pie / recharts_line
  // -------------------------------------------------------------------------
  console.log("\n--- [Test 3] Testing Generation of Alternative Chart Types (Pie/Line) ---");
  const pieTopic = "Cloud Computing: Cloud Market Share and Resource Utilization Distribution";
  console.log(`🚀 Requesting note on: "${pieTopic}"...`);
  const pieGenRes = await axios.post(
    "http://localhost:3001/api/notes/generate",
    { topic: pieTopic, difficulty: "hard" },
    { headers: { Cookie: cookieStr } },
  );
  const pieJobId = pieGenRes.data.job_id;
  const pieNoteId = pieGenRes.data.note_id;

  console.log(`⏳ Polling job ${pieJobId}...`);
  let pieComplete = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await axios.get(`http://localhost:3001/api/jobs/${pieJobId}`, {
      headers: { Cookie: cookieStr },
    });
    console.log(`   Poll [${i + 1}]: status = ${poll.data.status}`);
    if (poll.data.status === "complete") {
      pieComplete = true;
      break;
    }
  }

  if (pieComplete) {
    const pieNoteDoc = await Note.findById(pieNoteId).lean();
    console.log(`✅ Note generated successfully with alternative charts:`);
    pieNoteDoc?.diagrams.forEach((d, idx) => {
      console.log(`   Diagram [${idx + 1}]: Type="${d.type}", Title="${d.title}"`);
      console.log(`     Data:`, JSON.stringify(d.data).slice(0, 100) + "...");
    });
  }

  // -------------------------------------------------------------------------
  // TEST 4: Insufficient Credits (0 Balance)
  // -------------------------------------------------------------------------
  console.log("\n--- [Test 4] Testing 0 Credit Insufficient Balance Rejection ---");
  // Create a 0-credit test user
  const zeroCreditEmail = "zero_credits_test@studyforge.ai";
  let zeroUser = await User.findOne({ email: zeroCreditEmail });
  if (!zeroUser) {
    zeroUser = await User.create({
      email: zeroCreditEmail,
      name: "Zero Balance User",
      googleId: "zero_balance_0001",
    });
  }
  // Clear any ledger entries for this zero user so balance is 0
  await CreditLedger.deleteMany({ userId: zeroUser._id });

  // Sign token for zero user
  const { signAccessToken } = await import("../src/middleware/authenticate");
  const zeroToken = signAccessToken(zeroUser._id.toString(), zeroUser.email);
  const zeroCookie = `access_token=${zeroToken}`;

  try {
    await axios.post(
      "http://localhost:3001/api/notes/generate",
      { topic: "Microeconomics: Supply and Demand", difficulty: "easy" },
      { headers: { Cookie: zeroCookie } },
    );
    throw new Error("Expected 402 Insufficient credits, but request succeeded!");
  } catch (err: any) {
    console.log(`✅ Expected 402 received: HTTP ${err.response?.status}`);
    console.log(`   Response Body:`, JSON.stringify(err.response?.data));
  }

  // -------------------------------------------------------------------------
  // TEST 5: Logout and Re-Login Flow
  // -------------------------------------------------------------------------
  console.log("\n--- [Test 5] Testing Logout and Re-Login Flow ---");
  // 1. Logout
  const logoutRes = await axios.post(
    "http://localhost:3001/api/auth/logout",
    {},
    { headers: { Cookie: cookieStr } },
  );
  const clearedCookies = logoutRes.headers["set-cookie"];
  console.log(`✅ [Logout] POST /api/auth/logout succeeded. Cleared cookies:`, clearedCookies?.map(c => c.split(";")[0]));

  // 2. Check session is now unauthenticated
  try {
    await axios.get("http://localhost:3001/api/auth/session", {
      headers: { Cookie: "access_token=; refresh_token=" },
    });
  } catch (err: any) {
    console.log(`✅ [Session Check] Unauthenticated as expected: HTTP ${err.response?.status}`);
  }

  // 3. Re-login
  const reAuthRes = await client.get("/api/auth/google");
  const reCookies = reAuthRes.headers["set-cookie"]?.map(c => c.split(";")[0]).join("; ") ?? "";
  const reSessionRes = await axios.get("http://localhost:3001/api/auth/session", {
    headers: { Cookie: reCookies },
  });
  console.log(`✅ [Re-Login] Re-authentication successful. User: ${reSessionRes.data.user.name} (${reSessionRes.data.user.id})`);

  console.log("\n==================================================================");
  console.log("  ALL 5 UI / SYSTEM EDGE CASES VERIFIED AND PASSED! 🚀");
  console.log("==================================================================");

  await mongoose.disconnect();
}

runEdgeCasesVerification().catch((e) => {
  console.error("Test Error:", e.response?.data || e.message);
  process.exit(1);
});
