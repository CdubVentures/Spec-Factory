import type { DataChangeInvalidationOptions, DataChangeQueryClient } from '../../api/dataChangeInvalidationMap.js';

export type DataChangeInvalidationScheduler = {
  schedule: (args?: DataChangeInvalidationOptions) => unknown[][];
  flush: () => unknown[][];
  dispose: () => void;
  pendingCount: () => number;
};

export declare function createDataChangeInvalidationScheduler(args?: {
  queryClient?: DataChangeQueryClient | null;
  delayMs?: number;
  setTimeoutFn?: (fn: () => void, delay: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  onFlush?: (payload: {
    ts: string;
    queryKeys: unknown[][];
    queryKeyCount: number;
    categories: string[];
  }) => void;
}): DataChangeInvalidationScheduler;
