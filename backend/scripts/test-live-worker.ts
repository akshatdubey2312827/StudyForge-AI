import axios from "axios";

async function testLiveServerAndWorker() {
  console.log("=== Testing Live Server & Live BullMQ Worker Flow ===");
  
  // 1. Dev login to get session cookies
  const client = axios.create({
    baseURL: "http://localhost:3001",
    withCredentials: true,
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const authRes = await client.get("/api/auth/google");
  const cookieHeaders = authRes.headers["set-cookie"];
  console.log("✅ Authenticated via GET /api/auth/google, Set-Cookie:", cookieHeaders?.map(c => c.split(";")[0]).join("; "));

  const cookieStr = cookieHeaders?.map(c => c.split(";")[0]).join("; ") ?? "";

  // 2. Verify session
  const sessionRes = await axios.get("http://localhost:3001/api/auth/session", {
    headers: { Cookie: cookieStr },
  });
  console.log(`✅ Session verified: User ${sessionRes.data.user.name} (${sessionRes.data.user.id})`);

  // 3. Trigger note generation via POST /api/notes/generate
  console.log("🚀 Enqueuing note generation job to BullMQ queue...");
  const genRes = await axios.post(
    "http://localhost:3001/api/notes/generate",
    {
      topic: "Computer Networks: TCP Congestion Control and Flow Control",
      difficulty: "medium",
    },
    { headers: { Cookie: cookieStr } }
  );

  const { job_id: jobId, note_id: noteId } = genRes.data;
  console.log(`✅ Job enqueued successfully: Job ID = ${jobId}, Note ID = ${noteId}`);

  // 4. Poll live job status from server until noteWorker completes it
  console.log("⏳ Polling /api/jobs/:jobId waiting for noteWorker to process via BullMQ + Gemini...");
  let complete = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await axios.get(`http://localhost:3001/api/jobs/${jobId}`, {
      headers: { Cookie: cookieStr },
    });
    console.log(`   Poll [${i + 1}]: status = ${poll.data.status}, progress = ${poll.data.progress}%`);
    
    if (poll.data.status === "complete") {
      complete = true;
      break;
    }
    if (poll.data.status === "failed") {
      throw new Error(`Job failed: ${poll.data.error}`);
    }
  }

  if (!complete) {
    throw new Error("Job timed out waiting for worker");
  }

  // 5. Fetch full generated note
  const noteRes = await axios.get(`http://localhost:3001/api/notes/${noteId}`, {
    headers: { Cookie: cookieStr },
  });

  const note = noteRes.data;
  console.log("\n=======================================================");
  console.log("  LIVE WORKER NOTE GENERATION VERIFICATION COMPLETE");
  console.log("=======================================================");
  console.log(`  Topic:     ${note.topic}`);
  console.log(`  Status:    ${note.status}`);
  console.log(`  Content:   ${note.content.length} chars markdown`);
  console.log(`  Diagrams:  ${note.diagrams.length} items:`);
  note.diagrams.forEach((d: any, idx: number) => {
    console.log(`    [${idx + 1}] Type: "${d.type}" | Title: "${d.title}"`);
  });
  console.log(`  Questions: ${note.questions.length} items:`);
  note.questions.forEach((q: any, idx: number) => {
    console.log(`    [${idx + 1}] [${q.priority.toUpperCase()}] "${q.question}"`);
  });
  console.log("=======================================================\n");

  // 6. Test Billing Dev Checkout simulation
  const checkoutRes = await axios.post(
    "http://localhost:3001/api/billing/checkout",
    { package: "starter" },
    { headers: { Cookie: cookieStr } }
  );
  console.log("✅ Checkout simulation URL:", checkoutRes.data.checkout_url);

  const balRes = await axios.get("http://localhost:3001/api/billing/balance", {
    headers: { Cookie: cookieStr },
  });
  console.log(`✅ Current Balance: ${balRes.data.balance} cr, Lifetime Used: ${balRes.data.lifetime_used} cr`);
}

testLiveServerAndWorker().catch((e) => {
  console.error("Live test failed:", e.response?.data || e.message);
  process.exit(1);
});
