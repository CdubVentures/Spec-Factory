type ProcessStatusLike = {
  running?: boolean | null;
  run_id?: string | null;
  runId?: string | null;
} | null | undefined;

export function deriveProcessStatusFlags(processStatus: ProcessStatusLike) {
  return {
    isProcessRunning: Boolean(processStatus?.running),
    processStatusRunId: String(processStatus?.run_id || processStatus?.runId || '').trim(),
  };
}


