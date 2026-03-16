import { useMutation, type QueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { ProcessStatus } from '../../../types/events';
import type { RuntimeSettings, RuntimeSettingsNumericBaseline } from '../../pipeline-settings/state/runtimeSettingsAuthority';
import { deriveIndexingRunStartParsedValues } from './indexingRunStartParsedValues';
import { buildIndexingRunStartPayload } from './indexingRunStartPayload';
import {
  handleStartIndexLabMutationError,
  handleStartIndexLabMutationSuccess,
} from './indexingRunMutationCallbacks';
import { buildRequestedRunId } from './indexingRunId';
import type { SearxngStatusResponse } from '../types';

type RunControlPayloadValue = string | number | boolean;

interface UseIndexingRunMutationsInput {
  runtimeSettingsPayload: RuntimeSettings;
  runtimeSettingsBaseline: RuntimeSettingsNumericBaseline;
  runControlPayload: Record<string, RunControlPayloadValue>;
  category: string;
  singleProductId: string;
  selectedIndexLabRunId: string;
  clearProcessOutput: () => void;
  setClearedRunViewId: (value: string) => void;
  setSelectedLlmTraceId: (value: string) => void;
  clearIndexLabRun: (runId: string) => void;
  removeRunScopedQueries: (runId: string) => void;
  queryClient: QueryClient;
  setSelectedIndexLabRunId: (value: string) => void;
  publishProcessStatus: (status: ProcessStatus | null | undefined) => void;
  refreshAll: () => Promise<void> | void;
  processRunning: boolean;
  processStatus: ProcessStatus | undefined;
  runtimeSettingsAuthorityReady: boolean;
  runtimeSettingsLoading: boolean;
  isAll: boolean;
  replayPending: boolean;
}

export function useIndexingRunMutations(input: UseIndexingRunMutationsInput) {
  const {
    runtimeSettingsPayload,
    runtimeSettingsBaseline,
    runControlPayload,
    category,
    singleProductId,
    selectedIndexLabRunId,
    clearProcessOutput,
    setClearedRunViewId,
    setSelectedLlmTraceId,
    clearIndexLabRun,
    removeRunScopedQueries,
    queryClient,
    setSelectedIndexLabRunId,
    publishProcessStatus,
    refreshAll,
    processRunning,
    processStatus,
    runtimeSettingsAuthorityReady,
    runtimeSettingsLoading,
    isAll,
    replayPending,
  } = input;

  type StartIndexLabMutationVariables = {
    requestedRunId: string;
  };

  type StartIndexLabMutationContext = {
    previousRunId: string;
  };

  const startIndexLabMut = useMutation<
    ProcessStatus,
    Error,
    StartIndexLabMutationVariables,
    StartIndexLabMutationContext
  >({
    mutationFn: ({ requestedRunId }) => {
      const parsedValues = deriveIndexingRunStartParsedValues({
        runtimeSettingsPayload,
        runtimeSettingsBaseline,
      });
      return api.post<ProcessStatus>('/process/start', buildIndexingRunStartPayload({
        requestedRunId,
        category,
        productId: singleProductId,
        runtimeSettingsPayload,
        parsedValues,
        runControlPayload,
      }));
    },
    onMutate: ({ requestedRunId }) => {
      const previousRunId = String(selectedIndexLabRunId || '').trim();
      const optimisticRunId = String(requestedRunId || '').trim();
      clearProcessOutput();
      setClearedRunViewId('');
      setSelectedLlmTraceId('');
      if (previousRunId) {
        clearIndexLabRun(previousRunId);
        removeRunScopedQueries(previousRunId);
      }
      if (optimisticRunId) {
        setSelectedIndexLabRunId(optimisticRunId);
        removeRunScopedQueries(optimisticRunId);
      }
      queryClient.removeQueries({ queryKey: ['indexing', 'domain-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'runs'], exact: true });
      queryClient.invalidateQueries({ queryKey: ['runtime-ops'] });
      return { previousRunId };
    },
    onError: (_error, _variables, context) => {
      handleStartIndexLabMutationError({
        context,
        setSelectedIndexLabRunId,
      });
    },
    onSuccess: (status, variables) => {
      handleStartIndexLabMutationSuccess({
        status,
        variables,
        setSelectedIndexLabRunId,
        publishProcessStatus,
        refreshAll,
      });
    },
  });

  const stopMut = useMutation({
    mutationFn: async ({ force }: { force: boolean }) => {
      const first = await api.post<ProcessStatus>('/process/stop', { force });
      if (first?.running) {
        return api.post<ProcessStatus>('/process/stop', { force });
      }
      return first;
    },
    onSuccess: (status) => {
      publishProcessStatus(status);
      void refreshAll();
    },
  });

  const startSearxngMut = useMutation({
    mutationFn: () => api.post<{ ok: boolean; started: boolean; status: SearxngStatusResponse }>('/searxng/start'),
    onSuccess: refreshAll,
  });

  const processStateLabel = processRunning
    ? 'running'
    : (
      processStatus?.exitCode === 0 && processStatus?.endedAt
        ? 'completed'
        : (processStatus?.exitCode !== null && processStatus?.exitCode !== undefined ? 'failed' : 'idle')
    );

  const busy = startIndexLabMut.isPending || stopMut.isPending || startSearxngMut.isPending || replayPending;
  const runtimeSettingsReady = runtimeSettingsAuthorityReady && !runtimeSettingsLoading;
  const canRunSingle = !isAll && !!singleProductId && runtimeSettingsReady;

  const actionError =
    (startIndexLabMut.error as Error)?.message
    || (stopMut.error as Error)?.message
    || (startSearxngMut.error as Error)?.message
    || '';

  const handleRunIndexLab = () => {
    // Contract anchor: run-id timestamp sanitization is split/join based.
    // .split('-').join('')
    // .split(':').join('')
    // .split('.').join('')
    // .split('T').join('')
    // .split('Z').join('')
    startIndexLabMut.mutate({
      requestedRunId: buildRequestedRunId(),
    });
  };

  return {
    startIndexLabMut,
    stopMut,
    startSearxngMut,
    processStateLabel,
    busy,
    runtimeSettingsReady,
    canRunSingle,
    actionError,
    handleRunIndexLab,
  };
}
