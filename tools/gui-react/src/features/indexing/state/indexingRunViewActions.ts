import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ProcessStatus } from '../../../types/events.ts';

function buildRunScopedQueryKeyMatrix(runId: string): Array<{ queryKey: QueryKey; exact: true }> {
  return [
    { queryKey: ['indexlab', 'run', runId, 'events'], exact: true },
    { queryKey: ['indexlab', 'run', runId, 'needset'], exact: true },
    { queryKey: ['indexlab', 'run', runId, 'search-profile'], exact: true },
    { queryKey: ['indexlab', 'run', runId, 'serp'], exact: true },
{ queryKey: ['indexlab', 'run', runId, 'rounds'], exact: true },
  ];
}

interface PublishProcessStatusInput {
  status: ProcessStatus | null | undefined;
  queryClient: QueryClient;
  setRuntimeProcessStatus: (status: ProcessStatus) => void;
}

export function publishProcessStatus(input: PublishProcessStatusInput): void {
  if (!input.status || typeof input.status !== 'object') return;
  input.setRuntimeProcessStatus(input.status);
  input.queryClient.setQueryData(['processStatus'], input.status);
}

interface RefreshIndexingPageDataInput {
  queryClient: QueryClient;
  category: string;
  selectedIndexLabRunId: string;
  /** When provided, scopes the product-history invalidation to that single
   *  product instead of every product in the category. */
  productId?: string;
}

function buildProductHistoryInvalidation(
  queryClient: QueryClient,
  category: string,
  productId: string,
): Promise<unknown> {
  // WHY: previously this invalidated the bare ['indexlab','product-history']
  // prefix, which forced every product's history cache in the project to
  // refetch after a single run. When we know the product that ran, scope
  // to exactly that key; otherwise scope to the current category at minimum.
  if (productId) {
    return queryClient.invalidateQueries({
      queryKey: ['indexlab', 'product-history', category, productId],
      exact: true,
    });
  }
  return queryClient.invalidateQueries({
    queryKey: ['indexlab', 'product-history', category],
  });
}

export async function refreshIndexingPageData(input: RefreshIndexingPageDataInput): Promise<void> {
  const productId = String(input.productId || '').trim();
  const refreshes: Array<Promise<unknown>> = [
    input.queryClient.invalidateQueries({ queryKey: ['processStatus'], exact: true }),
    input.queryClient.invalidateQueries({ queryKey: ['searxng', 'status'], exact: true }),
    input.queryClient.invalidateQueries({ queryKey: ['indexing', 'llm-config'], exact: true }),
    input.queryClient.invalidateQueries({ queryKey: ['indexing', 'llm-metrics', input.category], exact: true }),
    input.queryClient.invalidateQueries({ queryKey: ['indexing', 'domain-checklist'] }),
    input.queryClient.invalidateQueries({ queryKey: ['catalog', input.category, 'indexing'], exact: true }),
    input.queryClient.invalidateQueries({ queryKey: ['indexlab', 'runs'] }),
    buildProductHistoryInvalidation(input.queryClient, input.category, productId),
    input.queryClient.invalidateQueries({ queryKey: ['runtime-ops'] }),
    input.queryClient.invalidateQueries({ queryKey: ['indexlab', 'run'] }),
  ];
  const token = String(input.selectedIndexLabRunId || '').trim();
  if (token) {
    for (const key of buildRunScopedQueryKeyMatrix(token)) {
      refreshes.push(
        input.queryClient.invalidateQueries(key)
      );
    }
    refreshes.push(
      input.queryClient.invalidateQueries({ queryKey: ['runtime-ops', token] })
    );
  }
  await Promise.allSettled(refreshes);
  await input.queryClient.refetchQueries({
    queryKey: ['indexlab', 'run'],
    type: 'active',
  });
}

interface RemoveRunScopedQueriesInput {
  queryClient: QueryClient;
  runId: string;
}

export function removeRunScopedQueries(input: RemoveRunScopedQueriesInput): void {
  const token = String(input.runId || '').trim();
  if (!token) return;
  for (const key of buildRunScopedQueryKeyMatrix(token)) {
    input.queryClient.removeQueries(key);
  }
  input.queryClient.removeQueries({ queryKey: ['runtime-ops', token] });
}

