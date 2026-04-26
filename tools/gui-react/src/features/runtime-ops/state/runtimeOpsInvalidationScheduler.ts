export const DEFAULT_RUNTIME_OPS_INVALIDATION_DELAY_MS = 150;

interface RuntimeOpsQueryClient {
  invalidateQueries: (args: { queryKey: readonly unknown[] }) => unknown;
}

interface RuntimeOpsInvalidationSchedulerOptions<TTimerId> {
  readonly queryClient: RuntimeOpsQueryClient;
  readonly delayMs?: number;
  readonly setTimeoutFn?: (fn: () => void, delay: number) => TTimerId;
  readonly clearTimeoutFn?: (id: TTimerId) => void;
}

export function createRuntimeOpsInvalidationScheduler<
  TTimerId = ReturnType<typeof setTimeout>,
>({
  queryClient,
  delayMs = DEFAULT_RUNTIME_OPS_INVALIDATION_DELAY_MS,
  setTimeoutFn,
  clearTimeoutFn,
}: RuntimeOpsInvalidationSchedulerOptions<TTimerId>) {
  const runIds = new Set<string>();
  const startTimer = setTimeoutFn ?? ((fn: () => void, delay: number) =>
    setTimeout(fn, delay) as TTimerId);
  const stopTimer = clearTimeoutFn ?? ((id: TTimerId) => {
    clearTimeout(id as ReturnType<typeof setTimeout>);
  });
  let timerId: TTimerId | null = null;

  function flush() {
    const pendingRunIds = [...runIds];
    runIds.clear();
    timerId = null;
    for (const runId of pendingRunIds) {
      queryClient.invalidateQueries({ queryKey: ['runtime-ops', runId] });
    }
  }

  return {
    schedule(runId: string) {
      const normalizedRunId = String(runId || '').trim();
      if (!normalizedRunId) return;
      runIds.add(normalizedRunId);
      if (timerId !== null) return;
      timerId = startTimer(flush, delayMs);
    },
    dispose() {
      runIds.clear();
      if (timerId === null) return;
      stopTimer(timerId);
      timerId = null;
    },
  };
}
