import { Router, Response } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate";
import { Job } from "../models/Job";
import { Note } from "../models/Note";
import mongoose from "mongoose";

const router = Router();

// ─── GET /api/jobs/:jobId ─────────────────────────────────────────────────────
// Poll job status — used by frontend useJobStatus hook every 2s
router.get("/:jobId", authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { jobId } = req.params;
  const userId = req.userId!;

  if (!mongoose.isValidObjectId(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  const job = await Job.findById(jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  // Security: ensure the job belongs to this user
  if (job.payload.userId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Calculate progress percentage based on status
  const progressMap: Record<string, number> = {
    pending: 0,
    processing: 50,
    complete: 100,
    failed: 0,
  };

  const response: {
    job_id: string;
    status: string;
    progress: number;
    note_id?: string;
    error?: string;
  } = {
    job_id: job._id.toString(),
    status: job.status,
    progress: progressMap[job.status] ?? 0,
  };

  if (job.status === "complete") {
    response.note_id = job.payload.noteId;
  }

  if (job.status === "failed" && job.error) {
    response.error = job.error;
  }

  res.json(response);
});

export default router;
