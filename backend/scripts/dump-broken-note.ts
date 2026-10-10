import "dotenv/config";
import mongoose from "mongoose";
import { Note } from "../src/models/Note";

async function dumpRecentNotes() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const notes = await Note.find({}).sort({ createdAt: -1 }).limit(5).lean();
  console.log(`Total notes found: ${notes.length}`);
  for (const n of notes) {
    console.log("----------------------------------------------------------------");
    console.log(`Note ID: ${n._id}`);
    console.log(`Topic: "${n.topic}"`);
    console.log(`CreatedAt: ${n.createdAt}`);
    console.log("Diagrams Raw Array:");
    console.log(JSON.stringify(n.diagrams, null, 2));
  }
  await mongoose.disconnect();
}

dumpRecentNotes().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
