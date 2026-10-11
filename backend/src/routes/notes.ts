import { Router, Response } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { generateRateLimiter } from "../middleware/rateLimiter";
import { GenerateNoteSchema, PaginationSchema } from "../schemas/zod";
import { atomicReserveForNote, refundReserve, getCreditCost } from "../services/credits";
import { Note } from "../models/Note";
import { Job } from "../models/Job";
import { noteQueue } from "../queues/noteQueue";
import { sanitizeTopic } from "../services/gemini";
import mongoose from "mongoose";

const router = Router();

// ─── GET /api/notes/costs ─────────────────────────────────────────────────────
router.get("/costs", (_req, res) => {
  res.json({
    easy: 1,
    medium: 2,
    hard: 3,
  });
});

// ─── POST /api/notes/generate ─────────────────────────────────────────────────
router.post(
  "/generate",
  authenticate,
  generateRateLimiter,
  validate(GenerateNoteSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { topic, difficulty } = req.body as { topic: string; difficulty: string };
    const userId = req.userId!;

    // 1. Sanitize topic before it reaches the Gemini prompt or any rendering
    const sanitizedTopic = sanitizeTopic(topic);

    if (sanitizedTopic.length < 3) {
      res.status(400).json({ error: "Topic is invalid or too short after sanitization" });
      return;
    }

    const creditCost = getCreditCost(difficulty);

    // 2. Atomically check balance, reserve credits, and create Note + Job in a single MongoDB transaction
    const reserveResult = await atomicReserveForNote(
      userId,
      sanitizedTopic,
      difficulty,
      creditCost,
    );

    if (!reserveResult.success) {
      res.status(402).json({
        error: "Insufficient credits",
        balance: reserveResult.balance,
        required: creditCost,
      });
      return;
    }

    const { noteId, jobId, ledgerReserveId } = reserveResult;

    // 3. Enqueue BullMQ job
    let bullJob;
    try {
      bullJob = await noteQueue.add(
        "generate-note",
        {
          userId,
          noteId: noteId!,
          topic: sanitizedTopic,
          difficulty,
          ledgerReserveId: ledgerReserveId!,
        },
        { jobId: jobId! },
      );
    } catch (enqueueErr) {
      // Roll back: refund reserve and clean up docs
      await refundReserve(
        new mongoose.Types.ObjectId(userId),
        creditCost,
        jobId!,
      );
      await Note.findByIdAndUpdate(noteId, { status: "failed" });
      await Job.findByIdAndUpdate(jobId, {
        status: "failed",
        error: "Failed to enqueue job",
      });
      throw enqueueErr;
    }

    // 4. Store BullMQ job ID back on Job document
    await Job.findByIdAndUpdate(jobId, { bullmqJobId: bullJob.id });

    // 5. Return immediately with job ID — do NOT call Gemini inline
    res.status(202).json({
      job_id: jobId,
      note_id: noteId,
      status: "pending",
      estimated_seconds: 15,
    });
  },
);

// ─── GET /api/notes ───────────────────────────────────────────────────────────
router.get(
  "/",
  authenticate,
  validate(PaginationSchema, "query"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { page, per_page } = req.query as unknown as { page: number; per_page: number };
    const userId = req.userId!;

    const skip = (page - 1) * per_page;

    const [notes, total] = await Promise.all([
      Note.find({ userId, status: "complete" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(per_page)
        .select("topic difficulty status createdAt"),
      Note.countDocuments({ userId, status: "complete" }),
    ]);

    res.json({
      notes: notes.map((n) => ({
        id: n._id.toString(),
        topic: n.topic,
        difficulty: n.difficulty,
        status: n.status,
        created_at: n.createdAt,
      })),
      total,
      page,
      per_page,
    });
  },
);

// ─── GET /api/notes/:noteId ───────────────────────────────────────────────────
router.get("/:noteId", authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { noteId } = req.params;
  const userId = req.userId!;

  if (!mongoose.isValidObjectId(noteId)) {
    res.status(400).json({ error: "Invalid note ID" });
    return;
  }

  const note = await Note.findOne({ _id: noteId, userId });

  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  res.json({
    id: note._id.toString(),
    job_id: note.jobId ?? "",
    user_id: note.userId.toString(),
    topic: note.topic,
    difficulty: note.difficulty,
    status: note.status,
    content: note.content,
    diagrams: note.diagrams,
    questions: note.questions,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  });
});

export default router;
