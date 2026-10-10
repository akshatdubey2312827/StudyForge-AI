import "dotenv/config";
import axios from "axios";
import mongoose from "mongoose";
import { Note } from "../src/models/Note";

async function testLineAndPie() {
  const client = axios.create({
    baseURL: "http://localhost:3001",
    withCredentials: true,
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  const authRes = await client.get("/api/auth/google");
  const cookieStr = authRes.headers["set-cookie"]?.map((c) => c.split(";")[0]).join("; ");

  console.log("Generating note for Time Complexity (recharts_line / recharts_pie)...");
  const genRes = await axios.post(
    "http://localhost:3001/api/notes/generate",
    {
      topic: "Algorithm Analysis: Big-O Growth Rates and Runtime Complexity of O(1), O(log N), O(N), O(N^2)",
      difficulty: "hard",
    },
    { headers: { Cookie: cookieStr } }
  );

  const jobId = genRes.data.job_id;
  const noteId = genRes.data.note_id;

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await axios.get(`http://localhost:3001/api/jobs/${jobId}`, { headers: { Cookie: cookieStr } });
    console.log(`Poll [${i + 1}]: status = ${poll.data.status}`);
    if (poll.data.status === "complete") {
      console.log("✅ Note Completed!");
      break;
    }
  }

  await mongoose.connect(process.env.MONGODB_URI!);
  const note = await Note.findById(noteId).lean();
  console.log("Diagrams returned:");
  note?.diagrams.forEach((d) => {
    console.log(`  - Type: "${d.type}" | Title: "${d.title}"`);
    console.log(`    Data:`, JSON.stringify(d.data).slice(0, 100));
  });
  await mongoose.disconnect();
}

testLineAndPie().catch(console.error);
