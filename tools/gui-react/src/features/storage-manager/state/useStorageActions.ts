import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type {
  DeleteRunResponse,
  BulkDeleteResponse,
  PruneResponse,
  PurgeResponse,
  DeleteUrlResponse,
  PurgeProductHistoryResponse,
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

interface DeleteUrlParams {
  url: string;
  productId: string;
  category: string;
}

export function useDeleteUrl() {
  const invalidate = useInvalidateStorage();
  return useMutation({
    mutationFn: (params: DeleteUrlParams) =>
      api.post<DeleteUrlResponse>('/storage/urls/delete', params),
    onSuccess: invalidate,
  });
}

interface PurgeProductHistoryParams {
  productId: string;
  category: string;
}

export function usePurgeProductHistory() {
  const invalidate = useInvalidateStorage();
  return useMutation({
    mutationFn: ({ productId, category }: PurgeProductHistoryParams) =>
      api.post<PurgeProductHistoryResponse>(
        `/storage/products/${encodeURIComponent(productId)}/purge-history`,
        { category },
      ),
    onSuccess: invalidate,
  });
}
