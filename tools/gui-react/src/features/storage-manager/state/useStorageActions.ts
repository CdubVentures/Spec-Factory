import { api } from '../../../api/client.ts';
import { useDataChangeMutation } from '../../data-change/index.js';
import type {
  DeleteRunResponse,
  BulkDeleteResponse,
  PruneResponse,
  PurgeResponse,
  DeleteUrlResponse,
  PurgeProductHistoryResponse,
} from '../types.ts';

export function useDeleteRun() {
  return useDataChangeMutation<DeleteRunResponse, Error, string>({
    event: 'storage-runs-deleted',
    mutationFn: (runId: string) =>
      api.del<DeleteRunResponse>(`/storage/runs/${encodeURIComponent(runId)}`),
  });
}

export function useBulkDeleteRuns() {
  return useDataChangeMutation<BulkDeleteResponse, Error, string[]>({
    event: 'storage-runs-bulk-deleted',
    mutationFn: (runIds: string[]) =>
      api.post<BulkDeleteResponse>('/storage/runs/bulk-delete', { runIds }),
  });
}

interface PruneParams {
  olderThanDays: number;
  failedOnly?: boolean;
}

export function usePruneRuns() {
  return useDataChangeMutation<PruneResponse, Error, PruneParams>({
    event: 'storage-pruned',
    mutationFn: (params: PruneParams) =>
      api.post<PruneResponse>('/storage/prune', params),
  });
}

export function usePurgeRuns() {
  return useDataChangeMutation<PurgeResponse>({
    event: 'storage-purged',
    mutationFn: () =>
      api.post<PurgeResponse>('/storage/purge', { confirmToken: 'DELETE' }),
  });
}

interface DeleteUrlParams {
  url: string;
  productId: string;
  category: string;
}

export function useDeleteUrl() {
  return useDataChangeMutation<DeleteUrlResponse, Error, DeleteUrlParams>({
    event: 'storage-urls-deleted',
    mutationFn: (params: DeleteUrlParams) =>
      api.post<DeleteUrlResponse>('/storage/urls/delete', params),
  });
}

interface PurgeProductHistoryParams {
  productId: string;
  category: string;
}

export function usePurgeProductHistory() {
  return useDataChangeMutation<PurgeProductHistoryResponse, Error, PurgeProductHistoryParams>({
    event: 'storage-history-purged',
    mutationFn: ({ productId, category }: PurgeProductHistoryParams) =>
      api.post<PurgeProductHistoryResponse>(
        `/storage/products/${encodeURIComponent(productId)}/purge-history`,
        { category },
      ),
  });
}
