import "dotenv/config";
import { Worker, type Job as BullJob } from "bullmq";
import { connectDB } from "../config/db";
import { createRedisClient } from "../config/redis";
import * as geminiService from "../services/gemini";
import { confirmSpend, refundReserve, getCreditCost } from "../services/credits";
import { Note } from "../models/Note";
import { Job } from "../models/Job";
import type { IJobPayload } from "../models/Job";
import mongoose from "mongoose";
import { NOTE_QUEUE_NAME } from "../queues/noteQueue";

// Dedicated Redis connection for worker (separate from queue connection)
const workerConnection = createRedisClient();

async function processNoteJob(bullJob: BullJob<IJobPayload>): Promise<void> {
  const { userId, noteId, topic, difficulty, ledgerReserveId } = bullJob.data;
  const creditCost = getCreditCost(difficulty);

  console.log(`[Worker] Processing job ${bullJob.id} — topic: "${topic}", difficulty: ${difficulty}, cost: ${creditCost} cr`);

  // Update job document to "processing"
  await Job.findByIdAndUpdate(bullJob.id, {
    status: "processing",
    $inc: { attempts: 1 },
  });

  // Update note status to "processing"
  await Note.findByIdAndUpdate(noteId, { status: "processing", jobId: bullJob.id });

  // ── Step 1: Call Gemini API (with timeout + up to 2 internal retries) ───────
  let geminiResponse;
  try {
    geminiResponse = await geminiService.generateNoteContent(topic, difficulty as "easy" | "medium" | "hard");
  } catch (geminiErr) {
    const errorMsg = geminiErr instanceof Error ? geminiErr.message : "Gemini error";
    console.error(`[Worker] Gemini failed for job ${bullJob.id}:`, errorMsg);

    // Mark as failed and refund
    await handleJobFailure(bullJob.id!, noteId, userId, ledgerReserveId, errorMsg, creditCost);
    throw geminiErr; // Let BullMQ know the job failed (triggers retry if attempts remain)
  }

  // ── Step 2: Schema already validated inside generateNoteContent() via Zod ───
  // Format diagram data: Recharts diagrams stored as structured objects, Mermaid as raw strings
  const diagrams = geminiResponse.diagrams.map((d) => {
    if (d.type.startsWith("recharts_")) {
      let parsedData = d.data;
      if (typeof d.data === "string") {
        try {
          parsedData = JSON.parse(d.data);
        } catch {
          // fallback to raw
        }
      }
      return {
        id: d.id,
        type: d.type,
        title: d.title,
        data: parsedData,
      };
    }
    return {
      id: d.id,
      type: d.type,
      title: d.title,
      data: d.data,
    };
  });

  // ── Step 3: Save the completed note ─────────────────────────────────────────
  const updatedNote = await Note.findByIdAndUpdate(
    noteId,
    {
      status: "complete",
      content: geminiResponse.content,
      diagrams,
      questions: geminiResponse.questions,
      updatedAt: new Date(),
    },
    { new: true },
  );

  if (!updatedNote) {
    const err = new Error(`Note ${noteId} not found after generation`);
    await handleJobFailure(bullJob.id!, noteId, userId, ledgerReserveId, err.message, creditCost);
    throw err;
  }

  // ── Step 4: Convert reserve → spend in credit ledger (with reconciliation safety) ──
  await confirmSpend(ledgerReserveId, bullJob.id, userId, creditCost);

  // ── Step 5: Mark Job complete ─────────────────────────────────────────────────
  await Job.findByIdAndUpdate(bullJob.id, {
    status: "complete",
    result: { noteId },
  });

  console.log(`[Worker] ✅ Job ${bullJob.id} completed — note ${noteId} saved (cost: ${creditCost} cr)`);
}

async function handleJobFailure(
  jobId: string,
  noteId: string,
  userId: string,
  ledgerReserveId: string,
  errorMsg: string,
  creditCost: number,
): Promise<void> {
  try {
    // Mark note as failed
    await Note.findByIdAndUpdate(noteId, { status: "failed" });

    // Mark job as failed
    await Job.findByIdAndUpdate(jobId, {
      status: "failed",
      error: errorMsg,
    });

    // Refund the reserved credits
    await refundReserve(
      new mongoose.Types.ObjectId(userId),
      creditCost,
      jobId,
    );

    console.log(`[Worker] Refunded ${creditCost} credits for failed job ${jobId}`);
  } catch (cleanupErr) {
    // Log but don't re-throw — cleanup failure shouldn't mask the original error
    console.error(`[Worker] Cleanup failed for job ${jobId}:`, cleanupErr);
  }
}

export function createNoteWorker() {
  const worker = new Worker<IJobPayload>(
    NOTE_QUEUE_NAME,
    async (job) => {
      await processNoteJob(job);
    },
    {
      connection: workerConnection,
      concurrency: 3, // Process up to 3 notes in parallel
      lockDuration: 60000, // 60s lock window renewed during processing
      stalledInterval: 30000, // Check for stalled/crashed jobs every 30s
      maxStalledCount: 2, // Re-queue stalled job up to 2 times before failing
    },
  );

  worker.on("completed", (job) => {
    console.log(`[Worker] BullMQ job ${job.id} marked completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] BullMQ job ${job?.id} failed:`, err.message);

    // On the final attempt (BullMQ won't retry again), ensure cleanup happened
    // handleJobFailure is called inside processNoteJob before re-throwing,
    // so this is just a final safety log.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      console.error(`[Worker] Job ${job.id} exhausted all retries — credits should be refunded`);
    }
  });

  worker.on("error", (err) => {
    console.error("[Worker] Worker error:", err);
  });

  return worker;
}
