import { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client.ts';
import { usePersistedToggle } from '../../../../stores/collapseStore.ts';
import { usePersistedNullableTab, usePersistedTab } from '../../../../stores/tabStore.ts';
import { TabStrip } from '../../../../shared/ui/navigation/TabStrip.tsx';
import { useRuntimeSettingsReader } from '../../../pipeline-settings/index.ts';
import type { RuntimeOpsWorkerRow, PrefetchTabKey, PreFetchPhasesResponse, PrefetchLiveSettings, FetchPhasesResponse } from '../../types.ts';
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

// WHY: Group-level tab definitions for the TabStrip selector.
const GROUP_TAB_ITEMS = STAGE_GROUP_REGISTRY.map((g) => ({
  id: g.id,
  label: g.label,
  description: g.tip,
}));

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
  const [poolFilter, setPoolFilter] = usePersistedTab<string>(`runtimeOps:workers:poolFilter:${category}`, 'all');
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
  const [stageTab, setStageTab] = usePersistedNullableTab<string>(
    `runtimeOps:workers:stageTab:${category}:${activeGroup}`,
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
      phaseCursor: prefetchData?.phase_cursor,
      tabKeys: PREFETCH_STAGE_KEYS,
    }),
    [isRunning, workers, prefetchData],
  );

  // WHY: For non-prefetch groups, no busy/disabled logic yet — empty sets.
  const activeBusyTabs: Set<string> | undefined = isPrefetchGroup ? busyPrefetchTabs : undefined;
  const activeDisabledTabs: Set<string> | undefined = isPrefetchGroup ? disabledPrefetchTabs : undefined;

  // ── Worker filtering ──────────────────────────────────────────────
  const pools = useMemo(() => {
    const set = new Set(workers.map((w) => w.pool));
    return ['all', ...Array.from(set).sort()];
  }, [workers]);

  const filtered = useMemo(() => {
    const list = poolFilter === 'all' ? workers : workers.filter((w) => w.pool === poolFilter);
    return sortWorkersForTabs(list);
  }, [workers, poolFilter]);

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
    if (!selectedWorker && filtered.length > 0 && stageTab === null) {
      const running = filtered.find((w) => w.state === 'running');
      onSelectWorker(running ?? filtered[0]);
    }
  }, [filtered, selectedWorker, stageTab, onSelectWorker]);

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

  const handleGroupChange = (groupId: StageGroupId) => {
    setActiveGroup(groupId);
  };

  const activeWorker = selectedWorker
    ? workers.find((w) => w.worker_id === selectedWorker.worker_id) ?? selectedWorker
    : null;

  const isStageActive = stageTab !== null;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b sf-border-default sf-surface-shell">
        <TabStrip
          tabs={GROUP_TAB_ITEMS}
          activeTab={activeGroup}
          onSelect={handleGroupChange}
          className="flex gap-1 px-1 py-0.5 sf-tab-strip rounded"
        />
      </div>

      <StageGroupTabRow
        groupLabel={activeGroupDef.label}
        registry={activeGroupDef.registry}
        activeTab={stageTab}
        onSelectTab={handleSelectStageTab}
        busyTabs={activeBusyTabs}
        disabledTabs={activeDisabledTabs}
        rightContent={
          <BrowserPoolBadge
            workers={workers}
            slotCount={Number(runtimeSettingsSnapshot?.crawlMaxConcurrentSlots) || 8}
            isRunning={isRunning}
            browserPoolMeta={browserPoolMeta}
          />
        }
      />

      <div className="px-4 py-2 flex items-center gap-2 border-b sf-border-default sf-surface-shell">
        <label className="sf-text-caption sf-text-muted">Pool:</label>
        <select
          value={poolFilter}
          onChange={(e) => setPoolFilter(e.target.value)}
          className="sf-select sf-text-caption px-2 py-1"
        >
          {pools.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <WorkerSubTabs
        workers={filtered}
        selectedWorkerId={isStageActive ? null : (activeWorker?.worker_id ?? null)}
        onSelectWorker={handleSelectWorker}
        poolFilter={poolFilter}
      />

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-h-0">
          {isStageActive ? (
            renderStagePanel(activeGroupDef, stageTab, category, isPrefetchGroup ? prefetchData : isFetchGroup ? fetchData : undefined, isPrefetchGroup ? liveSettings : undefined, runId)
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
