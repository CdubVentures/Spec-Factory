import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { ProcessStatus } from '../../../types/events';
import {
  invalidateRunScopedQueries as invalidateRunScopedQueriesAction,
  publishProcessStatus as publishProcessStatusAction,
  refreshIndexingPageData,
  removeRunScopedQueries as removeRunScopedQueriesAction,
} from './indexingRunViewActions';

interface UseIndexingRunViewHandlersInput {
  queryClient: QueryClient;
  category: string;
  selectedIndexLabRunId: string;
  clearProcessOutput: () => void;
  clearIndexLabRun: (runId: string) => void;
  setClearedRunViewId: (value: string) => void;
  setSelectedLlmTraceId: (value: string) => void;
  replayPending: boolean;
  setReplayPending: (value: boolean) => void;
  setRuntimeProcessStatus: (status: ProcessStatus) => void;
}

export function useIndexingRunViewHandlers(input: UseIndexingRunViewHandlersInput) {
  const {
    queryClient,
    category,
    selectedIndexLabRunId,
    clearProcessOutput,
    clearIndexLabRun,
    setClearedRunViewId,
    setSelectedLlmTraceId,
    replayPending,
    setReplayPending,
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

  const invalidateRunScopedQueries = useCallback(
    (runId: string) => invalidateRunScopedQueriesAction({ queryClient, runId }),
    [queryClient],
  );

  const clearSelectedRunView = useCallback(() => {
    const runId = String(selectedIndexLabRunId || '').trim();
    clearProcessOutput();
    if (!runId) {
      setClearedRunViewId('');
      setSelectedLlmTraceId('');
      return;
    }
    clearIndexLabRun(runId);
    removeRunScopedQueries(runId);
    queryClient.removeQueries({ queryKey: ['indexing', 'domain-checklist'] });
    setClearedRunViewId(runId);
    setSelectedLlmTraceId('');
  }, [
    selectedIndexLabRunId,
    clearProcessOutput,
    setClearedRunViewId,
    setSelectedLlmTraceId,
    clearIndexLabRun,
    removeRunScopedQueries,
    queryClient,
  ]);

  const replaySelectedRunView = useCallback(async () => {
    const runId = String(selectedIndexLabRunId || '').trim();
    if (!runId || replayPending) return;
    setReplayPending(true);
    try {
      setClearedRunViewId('');
      await invalidateRunScopedQueries(runId);
      await queryClient.refetchQueries({
        queryKey: ['indexlab', 'run', runId],
        type: 'active',
      });
    } finally {
      setReplayPending(false);
    }
  }, [
    selectedIndexLabRunId,
    replayPending,
    setReplayPending,
    setClearedRunViewId,
    invalidateRunScopedQueries,
    queryClient,
  ]);

  return {
    publishProcessStatus,
    refreshAll,
    removeRunScopedQueries,
    invalidateRunScopedQueries,
    clearSelectedRunView,
    replaySelectedRunView,
  };
}
