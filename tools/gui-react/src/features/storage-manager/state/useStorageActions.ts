import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type {
  DeleteRunResponse,
  BulkDeleteResponse,
  PruneResponse,
  PurgeResponse,
  RecalculateResponse,
  SyncStatusResponse,
  SyncPushResponse,
  SyncPullResponse,
} from '../types.ts';

function useInvalidateStorage() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['storage'] });
  };
}

export function useDeleteRun() {
  const invalidate = useInvalidateStorage();
  return useMutation({
    mutationFn: (runId: string) =>
      api.del<DeleteRunResponse>(`/storage/runs/${encodeURIComponent(runId)}`),
    onSuccess: invalidate,
  });
}

export function useBulkDeleteRuns() {
  const invalidate = useInvalidateStorage();
  return useMutation({
    mutationFn: (runIds: string[]) =>
      api.post<BulkDeleteResponse>('/storage/runs/bulk-delete', { runIds }),
    onSuccess: invalidate,
  });
}

interface PruneParams {
  olderThanDays: number;
  failedOnly?: boolean;
}

export function usePruneRuns() {
  const invalidate = useInvalidateStorage();
  return useMutation({
    mutationFn: (params: PruneParams) =>
      api.post<PruneResponse>('/storage/prune', params),
    onSuccess: invalidate,
  });
}

export function usePurgeRuns() {
  const invalidate = useInvalidateStorage();
  return useMutation({
    mutationFn: () =>
      api.post<PurgeResponse>('/storage/purge', { confirmToken: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useRecalculateMetrics() {
  const invalidate = useInvalidateStorage();
  return useMutation({
    mutationFn: () =>
      api.post<RecalculateResponse>('/storage/recalculate'),
    onSuccess: invalidate,
  });
}

export function useSyncStatus(enabled: boolean) {
  return useQuery<SyncStatusResponse>({
    queryKey: ['storage', 'sync', 'status'],
    queryFn: () => api.get<SyncStatusResponse>('/storage/sync/status'),
    enabled,
    staleTime: 15_000,
  });
}

export function usePushToS3() {
  const invalidate = useInvalidateStorage();
  return useMutation({
    mutationFn: () =>
      api.post<SyncPushResponse>('/storage/sync/push'),
    onSuccess: invalidate,
  });
}

export function usePullFromS3() {
  const invalidate = useInvalidateStorage();
  return useMutation({
    mutationFn: () =>
      api.post<SyncPullResponse>('/storage/sync/pull'),
    onSuccess: invalidate,
  });
}
