import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { ProcessStatus } from '../../../types/events.ts';
import {
  publishProcessStatus as publishProcessStatusAction,
  refreshIndexingPageData,
  removeRunScopedQueries as removeRunScopedQueriesAction,
} from './indexingRunViewActions.ts';

interface UseIndexingRunViewHandlersInput {
  queryClient: QueryClient;
  category: string;
  selectedIndexLabRunId: string;
  setRuntimeProcessStatus: (status: ProcessStatus) => void;
  /** Currently-picked product. Threaded into refreshAll so post-run
   *  invalidation of product-history is scoped to this product only. */
  productId: string;
}

export function useIndexingRunViewHandlers(input: UseIndexingRunViewHandlersInput) {
  const {
    queryClient,
    category,
    selectedIndexLabRunId,
    setRuntimeProcessStatus,
    productId,
  } = input;

  const publishProcessStatus = useCallback(
    (status: ProcessStatus | null | undefined) => {
      publishProcessStatusAction({
        status,
        queryClient,
        setRuntimeProcessStatus,
      });
    },
    [queryClient, setRuntimeProcessStatus],
  );

  const refreshAll = useCallback(
    () => refreshIndexingPageData({
      queryClient,
      category,
      selectedIndexLabRunId,
      productId,
    }),
    [queryClient, category, selectedIndexLabRunId, productId],
  );

  const removeRunScopedQueries = useCallback(
    (runId: string) => removeRunScopedQueriesAction({ queryClient, runId }),
    [queryClient],
  );

  return {
    publishProcessStatus,
    refreshAll,
    removeRunScopedQueries,
  };
}
