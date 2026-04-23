import { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client.ts';
import { usePersistedToggle } from '../../../../stores/collapseStore.ts';
import { usePersistedNullableTab, usePersistedTab, useTabStore } from '../../../../stores/tabStore.ts';
import { useRuntimeSettingsReader } from '../../../pipeline-settings/index.ts';
import type { RuntimeOpsWorkerRow, PrefetchTabKey, PreFetchPhasesResponse, PrefetchLiveSettings, FetchPhasesResponse, ExtractionPhasesResponse } from '../../types.ts';
import { getRefetchInterval } from '../../helpers.ts';
import { WorkerSubTabs } from './WorkerSubTabs.tsx';
import { FetchWorkerPanel } from './FetchWorkerPanel.tsx';
import { WorkerDataDrawer } from './WorkerDataDrawer.tsx';
import { SearchWorkerPanel } from './SearchWorkerPanel.tsx';
import { LlmWorkerPanel } from './LlmWorkerPanel.tsx';
import { BrowserPoolBadge } from './BrowserPoolBadge.tsx';
import { StageGroupTabRow } from '../shared/StageGroupTabRow.tsx';
import { STAGE_GROUP_REGISTRY, type StageGroupId, STAGE_GROUP_KEYS } from '../shared/stageGroupRegistry.ts';
import { PREFETCH_STAGE_KEYS } from '../prefetch/prefetchStageRegistry.ts';
import { buildBusyPrefetchTabs } from '../../selectors/prefetchTabBusyHelpers.js';
import {
  buildDisabledPrefetchTabs,
  normalizeActivePrefetchTab,
} from '../../selectors/prefetchUiContracts.ts';
import { normalizeActiveStageTab } from '../shared/stageTabUiContracts.ts';
import { sortWorkersForTabs } from '../../selectors/workerTabHelpers.js';

interface WorkersTabProps {
  workers: RuntimeOpsWorkerRow[];
  selectedWorker: RuntimeOpsWorkerRow | null;
  onSelectWorker: (w: RuntimeOpsWorkerRow | null) => void;
  runId: string;
  category: string;
  isRunning: boolean;
  wsUrl?: string;
  browserPoolMeta?: { status?: string; browsers?: number; slots?: number; pages_per_browser?: number } | null;
}

function toOptionalPositiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}

function toOptionalString(value: unknown): string | undefined {
  const token = String(value ?? '').trim();
  return token ? token : undefined;
}

export function WorkersTab({ workers, selectedWorker, onSelectWorker, runId, category, isRunning, wsUrl, browserPoolMeta }: WorkersTabProps) {
  const [drawerOpen, toggleDrawerOpen] = usePersistedToggle(`runtimeOps:workers:drawer:${category}`, true);

  // ── Group-level state ─────────────────────────────────────────────
  const [activeGroup, setActiveGroup] = usePersistedTab<StageGroupId>(
    `runtimeOps:workers:stageGroup:${category}`,
    'prefetch',
    { validValues: STAGE_GROUP_KEYS },
  );

  const activeGroupDef = useMemo(
    () => STAGE_GROUP_REGISTRY.find((g) => g.id === activeGroup) ?? STAGE_GROUP_REGISTRY[0],
    [activeGroup],
  );

  // ── Stage tab state (scoped to active group) ──────────────────────
  const stageTabKeyFor = (groupId: StageGroupId) =>
    `runtimeOps:workers:stageTab:${category}:${groupId}`;
  const [stageTab, setStageTab] = usePersistedNullableTab<string>(
    stageTabKeyFor(activeGroup),
    null,
    { validValues: activeGroupDef.keys },
  );

  // ── Prefetch-specific data (only fetched when prefetch group is active or running) ──
  const isPrefetchGroup = activeGroup === 'prefetch';
  const { data: prefetchData } = useQuery({
    queryKey: ['runtime-ops', runId, 'prefetch'],
    queryFn: () => api.get<PreFetchPhasesResponse>(`/indexlab/run/${runId}/runtime/prefetch`),
    enabled: Boolean(runId) && (isPrefetchGroup && stageTab !== null || isRunning),
    refetchInterval: getRefetchInterval(isRunning, false, stageTab !== null ? 3000 : 5000, 15000),
  });

  // ── Fetch-specific data (only fetched when fetch group is active or running) ──
  const isFetchGroup = activeGroup === 'fetch';
  const { data: fetchData } = useQuery({
    queryKey: ['runtime-ops', runId, 'fetch'],
    queryFn: () => api.get<FetchPhasesResponse>(`/indexlab/run/${runId}/runtime/fetch`),
    enabled: Boolean(runId) && (isFetchGroup && stageTab !== null || isRunning),
    refetchInterval: getRefetchInterval(isRunning, false, stageTab !== null ? 3000 : 5000, 15000),
  });

  // ── Extraction-specific data (only fetched when extraction group is active or running) ──
  const isExtractionGroup = activeGroup === 'extraction';
  const { data: extractionData } = useQuery({
    queryKey: ['runtime-ops', runId, 'extraction-plugins'],
    queryFn: () => api.get<ExtractionPhasesResponse>(`/indexlab/run/${runId}/runtime/extraction/plugins`),
    enabled: Boolean(runId) && (isExtractionGroup && stageTab !== null || isRunning),
    refetchInterval: getRefetchInterval(isRunning, false, stageTab !== null ? 3000 : 5000, 15000),
  });

  const { settings: runtimeSettingsSnapshot } = useRuntimeSettingsReader();

  const liveSettings = useMemo((): PrefetchLiveSettings | undefined => {
    if (!runtimeSettingsSnapshot) return undefined;
    return {
      profile: toOptionalString(runtimeSettingsSnapshot.profile),
      searchEngines: toOptionalString(runtimeSettingsSnapshot.searchEngines ?? runtimeSettingsSnapshot.searchProvider),
      discoveryEnabled: toOptionalBoolean(runtimeSettingsSnapshot.discoveryEnabled),
    };
  }, [runtimeSettingsSnapshot]);

  // ── Prefetch-specific disabled/busy tabs ──────────────────────────
  const disabledPrefetchTabs = useMemo(
    () => buildDisabledPrefetchTabs(liveSettings),
    [liveSettings],
  );

  const busyPrefetchTabs = useMemo(
    () => buildBusyPrefetchTabs({
      isRunning,
      workers,
      prefetchData,
      stageCursor: prefetchData?.stage_cursor,
      tabKeys: PREFETCH_STAGE_KEYS,
    }),
    [isRunning, workers, prefetchData],
  );

  // WHY: For non-prefetch groups, no busy/disabled logic yet — empty sets.
  const activeBusyTabs: Set<string> | undefined = isPrefetchGroup ? busyPrefetchTabs : undefined;
  const activeDisabledTabs: Set<string> | undefined = isPrefetchGroup ? disabledPrefetchTabs : undefined;

  const sorted = useMemo(() => sortWorkersForTabs(workers), [workers]);

  // ── Tab normalization (clear disabled selections) ─────────────────
  useEffect(() => {
    if (!isPrefetchGroup) {
      const next = normalizeActiveStageTab(stageTab, new Set<string>());
      if (next !== stageTab) setStageTab(next);
      return;
    }
    const next = normalizeActivePrefetchTab(stageTab as PrefetchTabKey | null, disabledPrefetchTabs);
    if (next !== stageTab) setStageTab(next);
  }, [isPrefetchGroup, disabledPrefetchTabs, stageTab, setStageTab]);

  // ── Auto-select first worker when no stage tab active ─────────────
  useEffect(() => {
    if (!selectedWorker && sorted.length > 0 && stageTab === null) {
      const running = sorted.find((w) => w.state === 'running');
      onSelectWorker(running ?? sorted[0]);
    }
  }, [sorted, selectedWorker, stageTab, onSelectWorker]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleSelectWorker = (workerId: string) => {
    setStageTab(null);
    const w = workers.find((w) => w.worker_id === workerId) ?? null;
    onSelectWorker(w);
  };

  const handleSelectStageTab = (tab: string | null) => {
    if (tab !== null && activeDisabledTabs?.has(tab)) return;
    setStageTab(tab);
  };

  // WHY: Typed wrapper for worker panels that need to open specific prefetch tabs.
  const handleSelectPrefetchTab = (tab: PrefetchTabKey | null) => {
    if (activeGroup !== 'prefetch') setActiveGroup('prefetch');
    handleSelectStageTab(tab);
  };

  const activeWorker = selectedWorker
    ? workers.find((w) => w.worker_id === selectedWorker.worker_id) ?? selectedWorker
    : null;

  const isStageActive = stageTab !== null;

  // WHY: Each row gets a handler that switches activeGroup before setting the tab,
  // so clicking a tab in a different row deselects the previous row's tab.
  // When switching groups, the `setStageTab` closure still references the
  // PREVIOUS group's storage key (the hook re-keys on the next render). Writing
  // the tab through that stale closure lands it under the wrong group, so the
  // new row appears inactive and the user has to click a second time. Bypass
  // the closure and write straight to the destination group's key.
  const handleGroupTabSelect = (groupId: StageGroupId) => (tab: string | null) => {
    if (tab !== null && groupId !== activeGroup) {
      setActiveGroup(groupId);
      useTabStore.getState().set(stageTabKeyFor(groupId), tab);
      return;
    }
    handleSelectStageTab(tab);
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── All 3 stage rows stacked ──────────────────────────────── */}
      {STAGE_GROUP_REGISTRY.map((group) => (
        <StageGroupTabRow
          key={group.id}
          groupLabel={group.label}
          registry={group.registry}
          activeTab={activeGroup === group.id ? stageTab : null}
          onSelectTab={handleGroupTabSelect(group.id)}
          busyTabs={group.id === 'prefetch' ? activeBusyTabs : undefined}
          disabledTabs={group.id === 'prefetch' ? activeDisabledTabs : undefined}
          rightContent={group.id === 'fetch' ? (
            <BrowserPoolBadge
              workers={workers}
              slotCount={Number(runtimeSettingsSnapshot?.crawlMaxConcurrentSlots) || 8}
              isRunning={isRunning}
              browserPoolMeta={browserPoolMeta}
            />
          ) : undefined}
        />
      ))}

      <WorkerSubTabs
        workers={sorted}
        selectedWorkerId={isStageActive ? null : (activeWorker?.worker_id ?? null)}
        onSelectWorker={handleSelectWorker}
      />

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-h-0">
          {isStageActive ? (
            renderStagePanel(activeGroupDef, stageTab, category, isPrefetchGroup ? prefetchData : isFetchGroup ? fetchData : isExtractionGroup ? extractionData : undefined, isPrefetchGroup ? liveSettings : undefined, runId)
          ) : activeWorker ? (
            renderWorkerPanel({
              worker: activeWorker,
              runId,
              category,
              wsUrl,
              isRunning,
              onOpenQueryJourney: () => handleSelectPrefetchTab('query_journey'),
              onOpenSearchResults: () => handleSelectPrefetchTab('search_results'),
              onOpenPrefetchTab: handleSelectPrefetchTab,
            })
          ) : (
            <div className="flex-1 flex items-center justify-center sf-text-subtle text-sm">
              {workers.length === 0
                ? 'No workers active yet. Workers will appear when the run starts fetching.'
                : 'Select a worker from the tabs above'}
            </div>
          )}
        </div>

        {!isStageActive && activeWorker?.pool === 'fetch' && (
          <WorkerDataDrawer
            runId={runId}
            workerId={activeWorker.worker_id}
            category={category}
            isOpen={drawerOpen}
            onToggle={toggleDrawerOpen}
            isRunning={isRunning}
            worker={activeWorker}
          />
        )}
      </div>
    </div>
  );
}

function renderWorkerPanel({
  worker,
  runId,
  category,
  wsUrl,
  isRunning,
  onOpenQueryJourney,
  onOpenSearchResults,
  onOpenPrefetchTab,
}: {
  worker: RuntimeOpsWorkerRow;
  runId: string;
  category: string;
  wsUrl?: string;
  isRunning: boolean;
  onOpenQueryJourney: () => void;
  onOpenSearchResults: () => void;
  onOpenPrefetchTab: (tab: PrefetchTabKey | null) => void;
}) {
  if (worker.pool === 'search') {
    return (
      <SearchWorkerPanel
        runId={runId}
        worker={worker}
        isRunning={isRunning}
        category={category}
        onOpenQueryJourney={onOpenQueryJourney}
        onOpenSearchResults={onOpenSearchResults}
        onOpenPrefetchTab={onOpenPrefetchTab}
      />
    );
  }

  if (worker.pool === 'llm') {
    return (
      <LlmWorkerPanel
        runId={runId}
        category={category}
        isRunning={isRunning}
        highlightWorkerId={worker.worker_id}
        idxRuntime={worker.idx_runtime}
        onOpenPrefetchTab={(tab) => onOpenPrefetchTab(tab)}
      />
    );
  }

  return <FetchWorkerPanel worker={worker} runId={runId} wsUrl={wsUrl} isRunning={isRunning} />;
}

// WHY: Generic stage panel renderer — looks up entry in active group's registry.
// For prefetch, passes full PrefetchPanelContext. For other groups, passes minimal context.
import type { AnyStageGroupDef } from '../shared/stageGroupContracts.ts';

function renderStagePanel(
  groupDef: AnyStageGroupDef,
  tabKey: string,
  persistScope: string,
  data?: unknown,
  liveSettings?: unknown,
  runId?: string,
) {
  const entry = groupDef.registry.find((e) => e.key === tabKey);
  if (!entry) return null;
  return entry.render({ data, persistScope, liveSettings, runId });
}
