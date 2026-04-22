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
}

export function useIndexingRunViewHandlers(input: UseIndexingRunViewHandlersInput) {
  const {
    queryClient,
    category,
    selectedIndexLabRunId,
    setRuntimeProcessStatus,
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
    }),
    [queryClient, category, selectedIndexLabRunId],
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
