import { CreditLedger } from "../models/CreditLedger";
import { Job } from "../models/Job";
import { Note } from "../models/Note";
import { addLedgerEntry, confirmSpend } from "./credits";

export interface ReconciliationReport {
  scanned: number;
  refunded: number;
  resolvedToSpend: number;
}

/**
 * Reconciles orphaned credit reservations.
 *
 * Scans for CreditLedger entries with reason "reserve" older than `thresholdMinutes`
 * that have not been finalized due to server crashes, worker restarts, or timeouts.
 *
 * - If the associated Note is found with status "complete", converts reserve -> "spend".
 * - Otherwise, automatically creates a "+delta" "refund" entry to restore user balance.
 */
export async function reconcileOrphanedReservations(
  thresholdMinutes = 15,
): Promise<ReconciliationReport> {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  const activeHeartbeatCutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 min active window

  const orphanedReserves = await CreditLedger.find({
    reason: "reserve",
    createdAt: { $lt: cutoff },
  });

  let refunded = 0;
  let resolvedToSpend = 0;

  for (const reserve of orphanedReserves) {
    // 1. Check if a refund already exists for this relatedId
    if (reserve.relatedId) {
      const existingRefund = await CreditLedger.findOne({
        userId: reserve.userId,
        reason: "refund",
        relatedId: reserve.relatedId,
      });

      if (existingRefund) {
        // Already refunded; no action needed
        continue;
      }

      // 2. Check the associated Job status
      const job = await Job.findById(reserve.relatedId);
      if (job) {
        // If job is actively processing within the heartbeat cutoff, skip it
        if (job.status === "processing" && job.updatedAt > activeHeartbeatCutoff) {
          console.log(`[Reconciler] Skipping reserve ${reserve._id}: Job ${job._id} is actively processing.`);
          continue;
        }

        // If job reached "complete", convert to spend
        if (job.payload?.noteId) {
          const note = await Note.findById(job.payload.noteId);
          if (note && note.status === "complete") {
            const cost = Math.abs(reserve.delta);
            await confirmSpend(reserve._id.toString(), job._id.toString(), reserve.userId, cost);
            await Job.findByIdAndUpdate(job._id, { status: "complete" });
            resolvedToSpend++;
            console.log(
              `[Reconciler] Converted orphaned reserve ${reserve._id} -> spend (Note ${note._id} was completed)`,
            );
            continue;
          }
        }
      }
    }

    // 3. If not completed, refund the reserved credits
    const refundAmount = Math.abs(reserve.delta);
    await addLedgerEntry(
      reserve.userId,
      refundAmount,
      "refund",
      reserve.relatedId ?? reserve._id.toString(),
    );

    if (reserve.relatedId) {
      await Job.findByIdAndUpdate(reserve.relatedId, {
        status: "failed",
        error: "Job timed out and was automatically refunded by reconciliation cleaner",
      });

      const job = await Job.findById(reserve.relatedId);
      if (job?.payload?.noteId) {
        await Note.findByIdAndUpdate(job.payload.noteId, { status: "failed" });
      }
    }

    refunded++;
    console.log(
      `[Reconciler] Refunded orphaned reserve ${reserve._id} (+${refundAmount} cr) for user ${reserve.userId}`,
    );
  }

  return {
    scanned: orphanedReserves.length,
    refunded,
    resolvedToSpend,
  };
}

/**
 * Starts a recurring background reconciliation task.
 */
export function startReconciliationScheduler(intervalMinutes = 5, thresholdMinutes = 10): NodeJS.Timeout {
  console.log(`[Reconciler] Starting scheduler: runs every ${intervalMinutes}m, threshold ${thresholdMinutes}m`);

  // Run initial pass on startup
  reconcileOrphanedReservations(thresholdMinutes).catch((err) =>
    console.error("[Reconciler] Initial reconciliation run failed:", err),
  );

  const interval = setInterval(() => {
    reconcileOrphanedReservations(thresholdMinutes).catch((err) =>
      console.error("[Reconciler] Periodic reconciliation run failed:", err),
    );
  }, intervalMinutes * 60 * 1000);

  return interval;
}
