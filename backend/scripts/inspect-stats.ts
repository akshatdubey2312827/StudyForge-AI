import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../src/models/User";
import { Note } from "../src/models/Note";
import { CreditLedger } from "../src/models/CreditLedger";
import { getBalance } from "../src/services/credits";

async function inspectUserStats() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const user = await User.findOne({ email: "akshat.dubey@studyforge.ai" });
  if (!user) {
    console.log("Dev user not found");
    return;
  }

  const completedNotes = await Note.countDocuments({ userId: user._id, status: "complete" });
  const totalNotes = await Note.countDocuments({ userId: user._id });
  const balance = await getBalance(user._id);

  const spendLedger = await CreditLedger.aggregate([
    { $match: { userId: user._id, delta: { $lt: 0 }, reason: "spend" } },
    { $group: { _id: null, total: { $sum: "$delta" } } },
  ]);
  const lifetimeUsed = Math.abs(spendLedger[0]?.total ?? 0);

  console.log("=== Test User Dashboard Stats ===");
  console.log(`User Name:       ${user.name}`);
  console.log(`Current Balance: ${balance} cr`);
  console.log(`Completed Notes: ${completedNotes}`);
  console.log(`Total Notes:     ${totalNotes}`);
  console.log(`Lifetime Used:   ${lifetimeUsed} cr`);
  console.log(`Expected Spend:  ${completedNotes * 2} cr (Completed Notes × 2)`);
  console.log(`Matches Exact?:  ${lifetimeUsed === completedNotes * 2 ? "YES ✅" : "NO ❌"}`);

  await mongoose.disconnect();
}

inspectUserStats().catch(console.error);
