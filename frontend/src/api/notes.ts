/**
 * Notes API — real backend calls via shared apiClient.
 */
import { apiClient } from "./client";
import type {
  GenerateNotePayload,
  GenerateNoteResponse,
  JobStatusResponse,
  Note,
  NoteListResponse,
} from "@/types";

/**
 * POST /api/notes/generate
 * Reserves credits and enqueues a note generation job.
 * Returns 202 with { job_id, note_id, status, estimated_seconds }.
 */
export async function generateNote(
  payload: GenerateNotePayload,
): Promise<GenerateNoteResponse> {
  const res = await apiClient.post<GenerateNoteResponse>(
    "/api/notes/generate",
    payload,
  );
  return res.data;
}

/**
 * GET /api/jobs/:jobId
 * Poll job status. Returns { job_id, status, progress, note_id?, error? }.
 */
export async function pollJobStatus(job_id: string): Promise<JobStatusResponse> {
  const res = await apiClient.get<JobStatusResponse>(`/api/jobs/${job_id}`);
  return res.data;
}

/**
 * GET /api/notes/:noteId
 * Fetch full note content after job completes.
 */
export async function getNote(note_id: string): Promise<Note | null> {
  const res = await apiClient.get<Note>(`/api/notes/${note_id}`);
  return res.data;
}

/**
 * GET /api/notes
 * List notes for the authenticated user.
 */
export async function listNotes(
  page = 1,
  per_page = 20,
): Promise<NoteListResponse> {
  const res = await apiClient.get<NoteListResponse>("/api/notes", {
    params: { page, per_page },
  });
  return res.data;
}
