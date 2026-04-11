import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deriveLlmKeyGateErrors, deriveSerperKeyGateError } from '../../../hooks/llmKeyGateHelpers.js';
import { useSerperCreditQuery } from '../../../hooks/useSerperCreditQuery.ts';
import { api } from '../../../api/client.ts';
import { useUiStore } from '../../../stores/uiStore.ts';
import { useRuntimeStore } from '../../runtime-ops/state/runtimeStore.ts';
import { useIndexLabStore } from '../state/indexlabStore.ts';
import { useCollapseStore, usePersistedToggle } from '../../../stores/collapseStore.ts';
import {
  readRuntimeSettingsBootstrap,
  useRuntimeSettingsReader,
} from '../../pipeline-settings/index.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import {
  RUNTIME_SETTING_DEFAULTS,
} from '../../../stores/settingsManifest.ts';
import { useSettingsAuthorityStore } from '../../../stores/settingsAuthorityStore.ts';
import type { ProcessStatus } from '../../../types/events.ts';
import { parseCatalogRows } from '../../catalog/api/catalogParsers.ts';
import {
  displayVariant,
} from '../helpers.tsx';
import type {
  IndexingLlmConfigResponse,
  PanelKey,
} from '../types.ts';
import { DEFAULT_PANEL_COLLAPSED } from '../types.ts';
import { deriveIndexingPanelCollapsed } from '../state/indexingPanelState.ts';
import { deriveProcessStatusFlags } from '../selectors/indexingStatusSelectors.ts';
import { useIndexingRunSelectionState } from '../state/indexingRunSelectionState.ts';
import { useIndexingRunQueries } from '../api/indexingRunQueries.ts';
import { useIndexingRunViewHandlers } from '../state/indexingRunViewHandlers.ts';
import { useIndexingProcessUnloadStop } from '../state/indexingProcessUnloadStop.ts';
import { useIndexingCatalogDerivations } from '../selectors/indexingCatalogDerivations.ts';
import { useIndexingRunMutations } from '../api/indexingRunMutations.ts';
import { useIndexingLlmModelDerivations } from '../selectors/indexingLlmModelDerivations.ts';
import { deriveRunControlPayload } from '../selectors/indexingRunControlSelectors.ts';
import { toRuntimeDraft } from '../../pipeline-settings/index.ts';
import {
  buildIndexingRuntimeDraft,
  buildIndexingRuntimeSettingsProjection,
} from '../state/indexingRuntimeSettingsProjection.ts';
import { PickerPanel } from '../panels/PickerPanel.tsx';
import { ProductHistoryPanel } from '../panels/ProductHistoryPanel.tsx';
import { FINDER_PANELS } from '../state/finderPanelRegistry.generated.ts';

export function IndexingPage() {
  const category = useUiStore((s) => s.category);
  const clearProcessOutput = useRuntimeStore((s) => s.clearProcessOutput);
  const setRuntimeProcessStatus = useRuntimeStore((s) => s.setProcessStatus);
  const liveIndexLabByRun = useIndexLabStore((s) => s.byRun);
  const clearIndexLabRun = useIndexLabStore((s) => s.clearRun);
  const queryClient = useQueryClient();
  const runtimeSettingsAuthorityReady = useSettingsAuthorityStore((s) => s.snapshot.runtimeReady);
  const runtimeBootstrap = useMemo(
    () => readRuntimeSettingsBootstrap(queryClient, RUNTIME_SETTING_DEFAULTS),
    [queryClient],
  );
  const runtimeManifestDefaults = useMemo(() => toRuntimeDraft(RUNTIME_SETTING_DEFAULTS), []);
  // WHY: Read from the shared Zustand value store — not React Query.
  // The store always has the latest editor state (including unsaved edits).
  // React Query only has the last server-persisted snapshot, which may be
  // up to 1500ms behind if the user just edited a setting.
  // WHY: ?? undefined converts the store's null to the undefined that downstream
  // consumers expect (buildIndexingRuntimeDraft, buildIndexingRuntimeSettingsProjection).
  const runtimeSettingsData = useRuntimeSettingsValueStore((s) => s.values) ?? undefined;
  // WHY: Keep useRuntimeSettingsReader for the initial fetch trigger — the authority
  // hook hydrates the Zustand store when server data arrives. We only need isLoading.
  const { isLoading: runtimeSettingsLoading } = useRuntimeSettingsReader();
  const runtimeDraft = useMemo(
    () => buildIndexingRuntimeDraft({
      runtimeSettings: runtimeSettingsData,
      runtimeBootstrap,
    }),
    [runtimeBootstrap, runtimeSettingsData],
  );
  const {
    llmModelPlan,
    llmModelReasoning,
  } = runtimeDraft;
  const singleBrand = useIndexLabStore((s) => s.pickerBrand);
  const setSingleBrand = useIndexLabStore((s) => s.setPickerBrand);
  const singleModel = useIndexLabStore((s) => s.pickerModel);
  const setSingleModel = useIndexLabStore((s) => s.setPickerModel);
  const singleProductId = useIndexLabStore((s) => s.pickerProductId);
  const setSingleProductId = useIndexLabStore((s) => s.setPickerProductId);
  const selectedIndexLabRunId = useIndexLabStore((s) => s.pickerRunId);
  const setSelectedIndexLabRunId = useIndexLabStore((s) => s.setPickerRunId);
  const [clearedRunViewId, setClearedRunViewId] = useState('');
  const collapseValues = useCollapseStore((s) => s.values);
  const collapseToggle = useCollapseStore((s) => s.toggle);
  const panelCollapsed = useMemo(() => deriveIndexingPanelCollapsed(collapseValues), [collapseValues]);
  const [stopForceKill, , setStopForceKill] = usePersistedToggle(`indexing:stopForceKill:${category}`, true);
  const [replayPending, setReplayPending] = useState(false);
  const previousCategoryRef = useRef(category);

  const { data: processStatus } = useQuery({
    queryKey: ['processStatus'],
    queryFn: () => api.get<ProcessStatus>('/process/status'),
    refetchInterval: 1500
  });
  const { isProcessRunning, processStatusRunId } = useMemo(
    () => deriveProcessStatusFlags(processStatus),
    [processStatus],
  );

  const { data: indexingLlmConfig } = useQuery({
    queryKey: ['indexing', 'llm-config'],
    queryFn: () => api.get<IndexingLlmConfigResponse>('/indexing/llm-config'),
    refetchInterval: 15_000
  });

  const { data: serperCredit } = useSerperCreditQuery();

  const llmKeyGateErrors = useMemo(() => {
    const llmErrors = deriveLlmKeyGateErrors(indexingLlmConfig?.routing_snapshot);
    const serperError = deriveSerperKeyGateError(serperCredit);
    return serperError ? [...llmErrors, serperError] : llmErrors;
  }, [indexingLlmConfig?.routing_snapshot, serperCredit]);

  const { data: catalog = [] } = useQuery({
    queryKey: ['catalog', category, 'indexing'],
    queryFn: () => api.parsedGet(`/catalog/${category}`, parseCatalogRows),
    enabled: true,
    refetchInterval: 5000
  });

  const {
    indexlabRuns,
    runViewCleared,
  } = useIndexingRunSelectionState({
    isProcessRunning,
    category,
    processStatusRunId,
    processStartedAt: String(processStatus?.startedAt || ''),
    selectedIndexLabRunId,
    setSelectedIndexLabRunId,
    clearedRunViewId,
    setClearedRunViewId,
  });

  const {
    indexlabEventsResp,
  } = useIndexingRunQueries({
    selectedIndexLabRunId,
    runViewCleared,
    isProcessRunning,
    panelCollapsed,
  });

  const {
    brandOptions,
    modelOptions,
    variantOptions,
    selectedCatalogProduct,
    selectedAmbiguityMeter,
  } = useIndexingCatalogDerivations({
    catalog,
    singleBrand,
    singleModel,
    singleProductId,
    setSingleBrand,
    setSingleModel,
    setSingleProductId,
  });

  const { resolveModelTokenDefaults } = useIndexingLlmModelDerivations({
    indexingLlmConfig,
    runtimeSettingsBootstrap: runtimeDraft,
    llmModelPlan,
    llmModelReasoning,
  });

  const {
    runtimeSettingsPayload,
    runtimeSettingsBaseline,
  } = useMemo(() => buildIndexingRuntimeSettingsProjection({
    runtimeSettings: runtimeSettingsData,
    runtimeBootstrap,
    runtimeManifestDefaults,
    resolveModelTokenDefaults,
  }), [
    resolveModelTokenDefaults,
    runtimeBootstrap,
    runtimeManifestDefaults,
    runtimeSettingsData,
  ]);

  useEffect(() => {
    if (previousCategoryRef.current === category) return;
    previousCategoryRef.current = category;
    setSingleBrand('');
    setSelectedIndexLabRunId('');
  }, [category]);

  const processRunning = isProcessRunning;
  useIndexingProcessUnloadStop(processRunning);

  const {
    publishProcessStatus,
    refreshAll,
    removeRunScopedQueries,
    clearSelectedRunView,
    replaySelectedRunView,
  } = useIndexingRunViewHandlers({
    queryClient,
    category,
    selectedIndexLabRunId,
    clearProcessOutput,
    clearIndexLabRun,
    setClearedRunViewId,
    replayPending,
    setReplayPending,
    setRuntimeProcessStatus,
  });

  const runControlPayload = useMemo(() => {
    return deriveRunControlPayload({
      runtimeSettingsBaseline,
      values: runtimeSettingsPayload,
    });
  }, [
    runtimeSettingsPayload,
    runtimeSettingsBaseline,
  ]);

  const {
    stopMut,
    busy,
    runtimeSettingsReady,
    canRunSingle,
    actionError,
    handleRunIndexLab,
  } = useIndexingRunMutations({
    runtimeSettingsPayload,
    runtimeSettingsBaseline,
    runControlPayload,
    category,
    singleProductId,
    selectedBrand: singleBrand,
    selectedModel: singleModel,
    selectedVariant: selectedCatalogProduct?.variant ?? '',
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
  });

  const togglePanel = (panel: PanelKey) => {
    collapseToggle(`indexing:panel:${panel}`, DEFAULT_PANEL_COLLAPSED[panel]);
  };

  const pickerPanelProps = {
    collapsed: panelCollapsed.picker,
    onToggle: () => togglePanel('picker'),
    busy,
    processRunning,
    singleBrand,
    onBrandChange: setSingleBrand,
    singleModel,
    onModelChange: setSingleModel,
    singleProductId,
    onProductIdChange: setSingleProductId,
    brandOptions,
    modelOptions,
    variantOptions,
    selectedCatalogProduct,
    displayVariant,
    selectedAmbiguityMeter,
    runtimeSettingsReady,
    canRunSingle,
    onRunIndexLab: handleRunIndexLab,
    stopForceKill,
    onStopForceKillChange: setStopForceKill,
    onStopProcess: (opts: { force: boolean }) => stopMut.mutate(opts),
    stopPending: stopMut.isPending,
    selectedIndexLabRunId,
    onClearSelectedRunView: clearSelectedRunView,
    onReplaySelectedRunView: replaySelectedRunView,
    llmKeyGateErrors,
  };

  return (
    <div className="space-y-4 flex flex-col">
      <PickerPanel {...pickerPanelProps} />
      <ProductHistoryPanel productId={singleProductId} category={category} />
      {FINDER_PANELS.map(({ id, component: Panel }) => (
        <Panel key={id} productId={singleProductId} category={category} />
      ))}

      {actionError && (
        <div className="sf-callout sf-callout-danger px-3 py-2 sf-text-caption" style={{ order: 100 }}>
          action failed: {actionError}
        </div>
      )}
    </div>
  );
}
