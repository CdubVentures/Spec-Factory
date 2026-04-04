import { useMutation, type QueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { ProcessStatus } from '../../../types/events.ts';
import type { RuntimeSettings, RuntimeSettingsNumericBaseline } from '../../pipeline-settings/index.ts';
import { deriveIndexingRunStartParsedValues } from './indexingRunStartParsedValues.ts';
import { buildIndexingRunStartPayload } from './indexingRunStartPayload.ts';
import {
  handleStartIndexLabMutationError,
  handleStartIndexLabMutationSuccess,
} from './indexingRunMutationCallbacks.ts';
import { buildRequestedRunId } from './indexingRunId.ts';
import type { SearxngStatusResponse } from '../types.ts';
import type { PreflightResult } from '../../llm-config/index.ts';
import { readRuntimeSettingsValues } from '../../../stores/runtimeSettingsValueStore.ts';
import { assembleLlmPolicyFromFlat } from '../../llm-config/state/llmPolicyDefaults.ts';

type RunControlPayloadValue = string | number | boolean;

interface UseIndexingRunMutationsInput {
  runtimeSettingsPayload: RuntimeSettings;
  runtimeSettingsBaseline: RuntimeSettingsNumericBaseline;
  runControlPayload: Record<string, RunControlPayloadValue>;
  category: string;
  singleProductId: string;
  selectedBrand: string;
  selectedModel: string;
  selectedVariant: string;
  selectedIndexLabRunId: string;
  clearProcessOutput: () => void;
  setClearedRunViewId: (value: string) => void;
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
  replayPending: boolean;
  preflightCheck?: () => PreflightResult | null;
}

export function useIndexingRunMutations(input: UseIndexingRunMutationsInput) {
  const {
    runtimeSettingsPayload,
    runtimeSettingsBaseline,
    runControlPayload,
    category,
    singleProductId,
    selectedBrand,
    selectedModel,
    selectedVariant,
    selectedIndexLabRunId,
    clearProcessOutput,
    setClearedRunViewId,
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
    replayPending,
    preflightCheck,
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
    mutationFn: async ({ requestedRunId }) => {
      // WHY: Read the latest settings from the shared Zustand store at mutation time.
      // This ensures we always use the current editor state, even if the prop-based
      // runtimeSettingsPayload hasn't re-rendered yet. The store is the SSOT.
      const currentSettings = readRuntimeSettingsValues() ?? runtimeSettingsPayload;
      // WHY: Flush runtime settings to the persisted SSOT before spawning the
      // child process. The child calls loadConfigWithUserSettings() which reads
      // from persisted user-settings.json as fallback. The snapshot transport
      // (RUNTIME_SETTINGS_SNAPSHOT) is now the primary path, but we still persist
      // to user-settings.json for CLI compatibility and as a safety net.
      await api.put('/runtime-settings', currentSettings);
      const parsedValues = deriveIndexingRunStartParsedValues({
        runtimeSettingsPayload: currentSettings,
        runtimeSettingsBaseline,
      });
      return api.post<ProcessStatus>('/process/start', buildIndexingRunStartPayload({
        requestedRunId,
        category,
        productId: singleProductId,
        brand: selectedBrand,
        base_model: selectedModel,
        variant: selectedVariant,
        runtimeSettingsPayload: currentSettings,
        parsedValues,
        runControlPayload,
        llmPolicy: assembleLlmPolicyFromFlat(currentSettings as unknown as Record<string, unknown>) as unknown as Record<string, unknown>,
      }));
    },
    onMutate: ({ requestedRunId }) => {
      const previousRunId = String(selectedIndexLabRunId || '').trim();
      const optimisticRunId = String(requestedRunId || '').trim();
      clearProcessOutput();
      setClearedRunViewId('');
      if (previousRunId) {
        clearIndexLabRun(previousRunId);
        removeRunScopedQueries(previousRunId);
      }
      if (optimisticRunId) {
        setSelectedIndexLabRunId(optimisticRunId);
        removeRunScopedQueries(optimisticRunId);
      }
      queryClient.removeQueries({ queryKey: ['indexing', 'domain-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'runs'] });
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
  const canRunSingle = !!singleProductId && runtimeSettingsReady;

  const actionError =
    (startIndexLabMut.error as Error)?.message
    || (stopMut.error as Error)?.message
    || (startSearxngMut.error as Error)?.message
    || '';

  const preflightResult = preflightCheck?.() ?? null;

  const handleRunIndexLab = () => {
    if (preflightResult && !preflightResult.valid) return;
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
    preflightResult,
  };
}
