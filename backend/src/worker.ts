/**
 * Worker entry point — run as a separate process: npm run worker
 *
 * This process ONLY runs the BullMQ worker, not the HTTP server.
 * Both processes share the same MongoDB and Redis connections.
 */
import "dotenv/config";
import { connectDB } from "./config/db";
import { createNoteWorker } from "./workers/noteWorker";
import { startReconciliationScheduler } from "./services/reconciliation";

async function bootstrap(): Promise<void> {
  console.log("\n⚙️  StudyForge Worker starting...");

  // Workers need MongoDB to save notes and update ledger
  await connectDB();

  const worker = createNoteWorker();
  console.log("✅ Note generation worker is running");

  // Start background reconciliation cleaner for orphaned reservations (every 5m, 10m threshold)
  const reconcilerInterval = startReconciliationScheduler(5, 10);
  console.log("✅ Orphaned reservation reconciliation cleaner active\n");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Worker] ${signal} received, shutting down gracefully...`);
    clearInterval(reconcilerInterval);
    await worker.close();
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
    console.log("[Worker] Shut down cleanly. Bye!");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    console.error("[Worker] Unhandled rejection:", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("[Worker] Uncaught exception:", err);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error("[Worker] Bootstrap failed:", err);
  process.exit(1);
});
