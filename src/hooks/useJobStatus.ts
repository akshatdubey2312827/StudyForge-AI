import { useCallback, useEffect, useRef, useState } from "react";
import { pollJobStatus } from "@/api/notes";
import type { JobStatusResponse, NoteStatus } from "@/types";

interface UseJobStatusOptions {
  /** How often to poll in milliseconds. Default: 2000 */
  intervalMs?: number;
  /** Called when status reaches "complete" */
  onComplete?: (noteId: string) => void;
  /** Called when status reaches "failed" */
  onFailed?: () => void;
}

interface UseJobStatusReturn {
  status: NoteStatus | null;
  progress: number;
  noteId: string | null;
  isPolling: boolean;
  error: string | null;
  start: (jobId: string) => void;
  stop: () => void;
}

export function useJobStatus(options: UseJobStatusOptions = {}): UseJobStatusReturn {
  const { intervalMs = 2000, onComplete, onFailed } = options;

  const [status, setStatus] = useState<NoteStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);


  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsPolling(false);
  }, []);


  const tick = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;

    try {
      const res: JobStatusResponse = await pollJobStatus(jobId);
      if (!isMountedRef.current) return;

      setStatus(res.status);
      setProgress(res.progress);

      if (res.status === "complete") {
        const nid = res.note_id ?? null;
        setNoteId(nid);
        stop();
        if (nid) onComplete?.(nid);
      } else if (res.status === "failed") {
        stop();
        onFailed?.();
      }
    } catch (e: unknown) {
      if (isMountedRef.current) {
        setError(e instanceof Error ? e.message : "Unknown error");
        stop();
      }
    }
  }, [stop, onComplete, onFailed]);

  const start = useCallback(
    (jobId: string) => {
      stop();
      jobIdRef.current = jobId;
      setStatus("pending");
      setProgress(0);
      setNoteId(null);
      setError(null);
      setIsPolling(true);

      // Poll immediately, then on interval
      tick();
      timerRef.current = setInterval(tick, intervalMs);

      // 90s timeout cap — if the job stays pending/in-progress too long, notify user gracefully
      timeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          stop();
          setError("This is taking longer than expected — check back shortly.");
        }
      }, 90_000);
    },
    [stop, tick, intervalMs],
  );


  // Cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  return { status, progress, noteId, isPolling, error, start, stop };
}
