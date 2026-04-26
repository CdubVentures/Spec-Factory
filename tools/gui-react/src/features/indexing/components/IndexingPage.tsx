import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deriveLlmKeyGateErrors, deriveSerperKeyGateError } from '../../../hooks/llmKeyGateHelpers.js';
import { useSerperCreditQuery } from '../../../hooks/useSerperCreditQuery.ts';
import { api } from '../../../api/client.ts';
import { useUiCategoryStore } from '../../../stores/uiCategoryStore.ts';
import { useRuntimeStore } from '../../runtime-ops/state/runtimeStore.ts';
import { useIndexLabStore } from '../state/indexlabStore.ts';
import { useCollapseStore } from '../../../stores/collapseStore.ts';
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
import type {
  IndexingLlmConfigResponse,
} from '../types.ts';
import { deriveIndexingPanelCollapsed } from '../state/indexingPanelState.ts';
import {
  getIndexingPanelCollapsedDefault,
  type IndexingTopPanelCollapseId,
} from '../../../shared/ui/finder/indexingPanelCollapseDefaults.ts';
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
import { PipelinePanel } from '../panels/PipelinePanel.tsx';
import { IndexingTabBar } from '../panels/IndexingTabBar.tsx';
import { FinderPanelSkeleton } from '../panels/FinderPanelSkeleton.tsx';
import {
  PIPELINE_TAB_ID,
  getIndexingTabIds,
  INDEXING_TAB_META,
  type IndexingTabId,
} from '../panels/finderTabMeta.ts';
import type { IndexingPanelId } from '../../../shared/ui/finder/IndexingPanelHeader.tsx';
import { FINDER_PANELS } from '../state/finderPanelRegistry.generated.ts';
import { usePersistedTab } from '../../../stores/tabStore.ts';

export function IndexingPage() {
  const category = useUiCategoryStore((s) => s.category);
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
  const recentSelections = useIndexLabStore((s) => s.recentSelections);
  const pushRecent = useIndexLabStore((s) => s.pushRecent);
  const collapseValues = useCollapseStore((s) => s.values);
  const collapseToggle = useCollapseStore((s) => s.toggle);
  const panelCollapsed = useMemo(() => deriveIndexingPanelCollapsed(collapseValues), [collapseValues]);
  const previousCategoryRef = useRef(category);

  const { data: processStatus } = useQuery({
    queryKey: ['processStatus'],
    queryFn: () => api.get<ProcessStatus>('/process/status'),
    // WHY: poll fast (2s) only while a process is actually running, slow
    // (10s) when idle. Function-form reads the current cached value so
    // the cadence adapts without an extra subscription.
    refetchInterval: (query) =>
      deriveProcessStatusFlags(query.state.data).isProcessRunning ? 2000 : 10_000,
  });
  const { isProcessRunning, processStatusRunId } = useMemo(
    () => deriveProcessStatusFlags(processStatus),
    [processStatus],
  );

  const { data: indexingLlmConfig, isPending: indexingLlmConfigPending } = useQuery({
    queryKey: ['indexing', 'llm-config'],
    queryFn: () => api.get<IndexingLlmConfigResponse>('/indexing/llm-config'),
    // WHY: LLM config rarely changes mid-session; previous 15s cadence
    // was unnecessary noise. Mutations invalidate this key explicitly.
    refetchInterval: 30_000,
  });

  const { data: serperCredit, isPending: serperCreditPending } = useSerperCreditQuery();

  // WHY: while either key-gate source is still on its first fetch, don't
  // evaluate missing-key errors — prevents a red banner from flashing
  // during tab switches / initial mount. PipelinePanel shows a Spinner
  // in place of the banner until both sources resolve.
  const keyGateLoading = indexingLlmConfigPending || serperCreditPending;

  const llmKeyGateErrors = useMemo(() => {
    if (keyGateLoading) return [];
    const llmErrors = deriveLlmKeyGateErrors(indexingLlmConfig?.routing_snapshot);
    const serperError = deriveSerperKeyGateError(serperCredit);
    return serperError ? [...llmErrors, serperError] : llmErrors;
  }, [keyGateLoading, indexingLlmConfig?.routing_snapshot, serperCredit]);

  const { data: catalog = [], isPending: catalogPending } = useQuery({
    queryKey: ['catalog', category, 'indexing'],
    queryFn: () => api.parsedGet(`/catalog/${category}`, parseCatalogRows),
    enabled: true,
    refetchInterval: 5000
  });

  const {
    indexlabRuns,
  } = useIndexingRunSelectionState({
    isProcessRunning,
    category,
    processStatusRunId,
    processStartedAt: String(processStatus?.startedAt || ''),
    selectedIndexLabRunId,
    setSelectedIndexLabRunId,
  });

  const {
    indexlabEventsResp,
  } = useIndexingRunQueries({
    selectedIndexLabRunId,
    isProcessRunning,
    panelCollapsed,
  });

  const {
    catalogRows,
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
  } = useIndexingRunViewHandlers({
    queryClient,
    category,
    selectedIndexLabRunId,
    setRuntimeProcessStatus,
    productId: singleProductId,
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
  });

  const togglePanel = useCallback((panel: IndexingTopPanelCollapseId) => {
    collapseToggle(`indexing:panel:${panel}`, getIndexingPanelCollapsedDefault(panel));
  }, [collapseToggle]);
  const togglePicker = useCallback(() => togglePanel('picker'), [togglePanel]);
  const togglePipeline = useCallback(() => togglePanel('pipeline'), [togglePanel]);
  const stopProcess = useCallback(() => stopMut.mutate(), [stopMut]);

  // WHY: Tab bar hosts Pipeline (fixed first tab) + the finder registry.
  // Active id is persisted per product + category so a returning user
  // lands on the last tab they used; new products default to Pipeline.
  const indexingTabIds = useMemo(() => getIndexingTabIds(), []);
  const [activeTabId, setActiveTabId] = usePersistedTab<IndexingTabId>(
    `indexing:tab:active:${singleProductId}:${category}`,
    PIPELINE_TAB_ID,
    { validValues: indexingTabIds },
  );
  const ActiveFinderPanel = useMemo(() => {
    if (activeTabId === PIPELINE_TAB_ID) return null;
    const entry = FINDER_PANELS.find((p) => p.id === activeTabId) ?? FINDER_PANELS[0];
    return entry.component;
  }, [activeTabId]);

  const linkedPanel = (INDEXING_TAB_META[activeTabId]?.iconClass ?? 'picker') as IndexingPanelId;

  const pickerPanelProps = useMemo(() => ({
    collapsed: panelCollapsed.picker,
    onToggle: togglePicker,
    busy,
    catalogRows,
    singleBrand,
    onBrandChange: setSingleBrand,
    singleModel,
    onModelChange: setSingleModel,
    singleProductId,
    onProductIdChange: setSingleProductId,
    selectedCatalogProduct,
    selectedAmbiguityMeter,
    recentSelections,
    onPushRecent: pushRecent,
    linkedPanel,
    catalogLoading: catalogPending,
  }), [
    panelCollapsed.picker, togglePicker, busy, catalogRows,
    singleBrand, setSingleBrand, singleModel, setSingleModel,
    singleProductId, setSingleProductId, selectedCatalogProduct,
    selectedAmbiguityMeter, recentSelections, pushRecent,
    linkedPanel, catalogPending,
  ]);

  const pipelinePanelProps = useMemo(() => ({
    collapsed: panelCollapsed.pipeline,
    onToggle: togglePipeline,
    busy,
    processRunning,
    runtimeSettingsReady,
    canRunSingle,
    onRunIndexLab: handleRunIndexLab,
    llmKeyGateErrors,
    keyGateLoading,
    onStopProcess: stopProcess,
    stopPending: stopMut.isPending,
    productId: singleProductId,
    category,
  }), [
    panelCollapsed.pipeline, togglePipeline, busy, processRunning,
    runtimeSettingsReady, canRunSingle, handleRunIndexLab,
    llmKeyGateErrors, keyGateLoading, stopProcess, stopMut.isPending,
    singleProductId, category,
  ]);

  return (
    <div className="space-y-4 flex flex-col">
      <PickerPanel {...pickerPanelProps} />
      {singleProductId ? (
        <>
          <IndexingTabBar
            activeId={activeTabId}
            onSelect={setActiveTabId}
            productId={singleProductId}
            category={category}
          />
          <div
            role="tabpanel"
            id={`finder-panel-${activeTabId}`}
            aria-labelledby={`finder-tab-${activeTabId}`}
          >
            {activeTabId === PIPELINE_TAB_ID ? (
              <PipelinePanel {...pipelinePanelProps} />
            ) : ActiveFinderPanel ? (
              <Suspense fallback={<FinderPanelSkeleton />}>
                <ActiveFinderPanel
                  key={activeTabId}
                  productId={singleProductId}
                  category={category}
                />
              </Suspense>
            ) : null}
          </div>
        </>
      ) : null}

      {actionError && (
        <div className="sf-callout sf-callout-danger px-3 py-2 sf-text-caption" style={{ order: 100 }}>
          action failed: {actionError}
        </div>
      )}
    </div>
  );
}
