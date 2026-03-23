import { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client';
import { usePersistedToggle } from '../../../../stores/collapseStore';
import { usePersistedNullableTab, usePersistedTab } from '../../../../stores/tabStore';
import { useRuntimeSettingsReader } from '../../../pipeline-settings';
import type { RuntimeOpsWorkerRow, PrefetchTabKey, PreFetchPhasesResponse, PrefetchLiveSettings } from '../../types';
import { getRefetchInterval } from '../../helpers';
import { WorkerSubTabs } from './WorkerSubTabs';
import { WorkerLivePanel } from './WorkerLivePanel';
import { WorkerDataDrawer } from './WorkerDataDrawer';
import { SearchWorkerPanel } from './SearchWorkerPanel';
import { LlmCallsDashboard } from './LlmCallsDashboard';
import { PrefetchTabRow } from '../prefetch/PrefetchTabRow';
import { PREFETCH_STAGE_REGISTRY, PREFETCH_STAGE_KEYS } from '../prefetch/prefetchStageRegistry';
import { buildBusyPrefetchTabs } from '../../selectors/prefetchTabBusyHelpers.js';
import {
  buildDisabledPrefetchTabs,
  normalizeActivePrefetchTab,
} from '../../selectors/prefetchUiContracts';
import { sortWorkersForTabs } from '../../selectors/workerTabHelpers.js';

interface WorkersTabProps {
  workers: RuntimeOpsWorkerRow[];
  selectedWorker: RuntimeOpsWorkerRow | null;
  onSelectWorker: (w: RuntimeOpsWorkerRow | null) => void;
  runId: string;
  category: string;
  isRunning: boolean;
  wsUrl?: string;
}

// WHY: Tab keys now derived from PREFETCH_STAGE_REGISTRY (O(1) scaling).
const PREFETCH_TAB_KEYS = PREFETCH_STAGE_KEYS;

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

export function WorkersTab({ workers, selectedWorker, onSelectWorker, runId, category, isRunning, wsUrl }: WorkersTabProps) {
  const [poolFilter, setPoolFilter] = usePersistedTab<string>(`runtimeOps:workers:poolFilter:${category}`, 'all');
  const [drawerOpen, toggleDrawerOpen] = usePersistedToggle(`runtimeOps:workers:drawer:${category}`, true);
  const [prefetchTab, setPrefetchTab] = usePersistedNullableTab<PrefetchTabKey>(
    `runtimeOps:workers:prefetchTab:${category}`,
    null,
    { validValues: PREFETCH_TAB_KEYS },
  );

  const { data: prefetchData } = useQuery({
    queryKey: ['runtime-ops', runId, 'prefetch'],
    queryFn: () => api.get<PreFetchPhasesResponse>(`/indexlab/run/${runId}/runtime/prefetch`),
    enabled: Boolean(runId) && (prefetchTab !== null || isRunning),
    refetchInterval: getRefetchInterval(isRunning, false, prefetchTab !== null ? 3000 : 5000, 15000),
  });

  const { settings: runtimeSettingsSnapshot } = useRuntimeSettingsReader();

  const liveSettings = useMemo((): PrefetchLiveSettings | undefined => {
    if (!runtimeSettingsSnapshot) return undefined;
    return {
      profile: toOptionalString(runtimeSettingsSnapshot.profile),
      searchEngines: toOptionalString(runtimeSettingsSnapshot.searchEngines ?? runtimeSettingsSnapshot.searchProvider),
      discoveryEnabled: toOptionalBoolean(runtimeSettingsSnapshot.discoveryEnabled),
      dynamicCrawleeEnabled: toOptionalBoolean(runtimeSettingsSnapshot.dynamicCrawleeEnabled),
      scannedPdfOcrEnabled: toOptionalBoolean(runtimeSettingsSnapshot.scannedPdfOcrEnabled),
      maxPagesPerDomain: toOptionalPositiveInt(runtimeSettingsSnapshot.maxPagesPerDomain),
      discoveryResultsPerQuery: toOptionalPositiveInt(runtimeSettingsSnapshot.discoveryResultsPerQuery),
    };
  }, [runtimeSettingsSnapshot]);

  const disabledPrefetchTabs = useMemo(
    () => buildDisabledPrefetchTabs(liveSettings),
    [liveSettings],
  );

  const pools = useMemo(() => {
    const set = new Set(workers.map((w) => w.pool));
    return ['all', ...Array.from(set).sort()];
  }, [workers]);

  const filtered = useMemo(() => {
    const list = poolFilter === 'all' ? workers : workers.filter((w) => w.pool === poolFilter);
    return sortWorkersForTabs(list);
  }, [workers, poolFilter]);

  useEffect(() => {
    const nextPrefetchTab = normalizeActivePrefetchTab(prefetchTab, disabledPrefetchTabs);
    if (nextPrefetchTab === prefetchTab) return;
    setPrefetchTab(nextPrefetchTab);
  }, [disabledPrefetchTabs, prefetchTab, setPrefetchTab]);

  useEffect(() => {
    if (!selectedWorker && filtered.length > 0 && prefetchTab === null) {
      const running = filtered.find((w) => w.state === 'running');
      onSelectWorker(running ?? filtered[0]);
    }
  }, [filtered, selectedWorker, prefetchTab, onSelectWorker]);

  const handleSelectWorker = (workerId: string) => {
    setPrefetchTab(null);
    const w = workers.find((w) => w.worker_id === workerId) ?? null;
    onSelectWorker(w);
  };

  const handleSelectPrefetchTab = (tab: PrefetchTabKey | null) => {
    if (tab !== null && disabledPrefetchTabs.has(tab)) return;
    setPrefetchTab(tab);
  };

  const activeWorker = selectedWorker
    ? workers.find((w) => w.worker_id === selectedWorker.worker_id) ?? selectedWorker
    : null;

  const isPrefetchActive = prefetchTab !== null;
  const busyPrefetchTabs = useMemo(
    () => buildBusyPrefetchTabs({
      isRunning,
      workers,
      prefetchData,
      phaseCursor: prefetchData?.phase_cursor,
      tabKeys: PREFETCH_TAB_KEYS,
    }),
    [isRunning, workers, prefetchData],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PrefetchTabRow activeTab={prefetchTab} onSelectTab={handleSelectPrefetchTab} busyTabs={busyPrefetchTabs} disabledTabs={disabledPrefetchTabs} />

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
        selectedWorkerId={isPrefetchActive ? null : (activeWorker?.worker_id ?? null)}
        onSelectWorker={handleSelectWorker}
        poolFilter={poolFilter}
      />

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-h-0">
          {isPrefetchActive ? (
            renderPrefetchPanel(prefetchTab, prefetchData, category, liveSettings, runId)
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

        {!isPrefetchActive && activeWorker?.pool === 'fetch' && (
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
      <LlmCallsDashboard
        runId={runId}
        category={category}
        isRunning={isRunning}
        highlightWorkerId={worker.worker_id}
        idxRuntime={worker.idx_runtime}
        onOpenPrefetchTab={(tab) => onOpenPrefetchTab(tab)}
      />
    );
  }

  return <WorkerLivePanel worker={worker} runId={runId} wsUrl={wsUrl} isRunning={isRunning} />;
}

// WHY: Panel routing now driven by PREFETCH_STAGE_REGISTRY (O(1) scaling).
function renderPrefetchPanel(tab: PrefetchTabKey, data: PreFetchPhasesResponse | undefined, persistScope: string, liveSettings: PrefetchLiveSettings | undefined, runId?: string) {
  const entry = PREFETCH_STAGE_REGISTRY.find((e) => e.key === tab);
  if (!entry) return null;
  return entry.render({ data, persistScope, liveSettings, runId });
}
