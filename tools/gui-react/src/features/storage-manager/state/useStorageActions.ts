import { api } from '../../../api/client.ts';
import { useDataChangeMutation } from '../../data-change/index.js';
import type { DataChangeMutationMessage } from '../../data-change/index.js';
import type {
  DeleteRunResponse,
  BulkDeleteResponse,
  PruneResponse,
  PurgeResponse,
  DeleteUrlResponse,
  PurgeProductHistoryResponse,
} from '../types.ts';

interface StorageScopeResponse {
  readonly category?: string;
  readonly categories?: readonly string[];
  readonly product_id?: string;
  readonly product_ids?: readonly string[];
}

interface ProductScopedVariables {
  readonly category: string;
  readonly productId: string;
}

function uniqueTokens(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function storageScopeMessage(data: StorageScopeResponse): DataChangeMutationMessage {
  const categories = uniqueTokens([
    data.category,
    ...(data.categories ?? []),
  ]);
  const productIds = uniqueTokens([
    data.product_id,
    ...(data.product_ids ?? []),
  ]);
  return {
    ...(categories.length === 1 ? { category: categories[0] } : {}),
    categories,
    entities: { productIds },
  };
}

function productScopedMessage(variables: ProductScopedVariables): DataChangeMutationMessage {
  return {
    category: variables.category,
    entities: { productIds: [variables.productId] },
  };
}

export function useDeleteRun() {
  return useDataChangeMutation<DeleteRunResponse, Error, string>({
    event: 'storage-runs-deleted',
    mutationFn: (runId: string) =>
      api.del<DeleteRunResponse>(`/storage/runs/${encodeURIComponent(runId)}`),
    resolveDataChangeMessage: ({ data }) => storageScopeMessage(data),
  });
}

export function useBulkDeleteRuns() {
  return useDataChangeMutation<BulkDeleteResponse, Error, string[]>({
    event: 'storage-runs-bulk-deleted',
    mutationFn: (runIds: string[]) =>
      api.post<BulkDeleteResponse>('/storage/runs/bulk-delete', { runIds }),
    resolveDataChangeMessage: ({ data }) => storageScopeMessage(data),
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
    resolveDataChangeMessage: ({ data }) => storageScopeMessage(data),
  });
}

export function usePurgeRuns() {
  return useDataChangeMutation<PurgeResponse>({
    event: 'storage-purged',
    mutationFn: () =>
      api.post<PurgeResponse>('/storage/purge', { confirmToken: 'DELETE' }),
    resolveDataChangeMessage: ({ data }) => storageScopeMessage(data),
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
    resolveDataChangeMessage: ({ variables }) => productScopedMessage(variables),
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
    resolveDataChangeMessage: ({ variables }) => productScopedMessage(variables),
  });
}
