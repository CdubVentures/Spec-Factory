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

export function deriveSearxngStatusErrorMessage(searxngStatusError: unknown) {
  const message = String((searxngStatusError as Error)?.message || '').trim();
  if (!message) return '';
  if (message.toLowerCase().includes('failed to fetch')) return '';
  return message;
}

