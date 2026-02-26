import { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { usePersistedToggle } from '../../../stores/collapseStore';
import { usePersistedNullableTab, usePersistedTab } from '../../../stores/tabStore';
import { useRuntimeSettingsReader } from '../../../stores/runtimeSettingsAuthority';
import type { RuntimeOpsWorkerRow, PrefetchTabKey, PreFetchPhasesResponse, PrefetchLiveSettings } from '../types';
import { getRefetchInterval } from '../helpers';
import { WorkerSubTabs } from './WorkerSubTabs';
import { WorkerLivePanel } from './WorkerLivePanel';
import { WorkerDataDrawer } from './WorkerDataDrawer';
import { PrefetchTabRow } from './PrefetchTabRow';
import { PrefetchNeedSetPanel } from './PrefetchNeedSetPanel';
import { PrefetchSearchProfilePanel } from './PrefetchSearchProfilePanel';
import { PrefetchBrandResolverPanel } from './PrefetchBrandResolverPanel';
import { PrefetchSearchPlannerPanel } from './PrefetchSearchPlannerPanel';
import { PrefetchQueryJourneyPanel } from './PrefetchQueryJourneyPanel';
import { PrefetchSearchResultsPanel } from './PrefetchSearchResultsPanel';
import { PrefetchUrlPredictorPanel } from './PrefetchUrlPredictorPanel';
import { PrefetchSerpTriagePanel } from './PrefetchSerpTriagePanel';
import { PrefetchDomainClassifierPanel } from './PrefetchDomainClassifierPanel';
import { buildBusyPrefetchTabs } from './prefetchTabBusyHelpers.js';

interface WorkersTabProps {
  workers: RuntimeOpsWorkerRow[];
  selectedWorker: RuntimeOpsWorkerRow | null;
  onSelectWorker: (w: RuntimeOpsWorkerRow | null) => void;
  runId: string;
  category: string;
  isRunning: boolean;
  wsUrl?: string;
}

const PREFETCH_TAB_KEYS = [
  'needset',
  'search_profile',
  'brand_resolver',
  'search_planner',
  'query_journey',
  'search_results',
  'url_predictor',
  'serp_triage',
  'domain_classifier',
] as const satisfies ReadonlyArray<PrefetchTabKey>;

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
    enabled: Boolean(runId) && prefetchTab !== null,
    refetchInterval: getRefetchInterval(isRunning, prefetchTab === null, 3000, 15000),
  });

  const { settings: runtimeSettingsSnapshot } = useRuntimeSettingsReader();

  const liveSettings = useMemo((): PrefetchLiveSettings | undefined => {
    if (!runtimeSettingsSnapshot) return undefined;
    return {
      profile: toOptionalString(runtimeSettingsSnapshot.profile),
      phase2LlmEnabled: toOptionalBoolean(runtimeSettingsSnapshot.phase2LlmEnabled),
      phase3LlmTriageEnabled: toOptionalBoolean(runtimeSettingsSnapshot.phase3LlmTriageEnabled),
      searchProvider: toOptionalString(runtimeSettingsSnapshot.searchProvider),
      discoveryEnabled: toOptionalBoolean(runtimeSettingsSnapshot.discoveryEnabled),
      dynamicCrawleeEnabled: toOptionalBoolean(runtimeSettingsSnapshot.dynamicCrawleeEnabled),
      scannedPdfOcrEnabled: toOptionalBoolean(runtimeSettingsSnapshot.scannedPdfOcrEnabled),
      maxPagesPerDomain: toOptionalPositiveInt(runtimeSettingsSnapshot.maxPagesPerDomain),
      discoveryResultsPerQuery: toOptionalPositiveInt(runtimeSettingsSnapshot.discoveryResultsPerQuery),
      discoveryMaxDiscovered: toOptionalPositiveInt(runtimeSettingsSnapshot.discoveryMaxDiscovered),
      serpTriageMaxUrls: toOptionalPositiveInt(runtimeSettingsSnapshot.serpTriageMaxUrls),
      uberMaxUrlsPerDomain: toOptionalPositiveInt(runtimeSettingsSnapshot.uberMaxUrlsPerDomain),
    };
  }, [runtimeSettingsSnapshot]);

  const disabledPrefetchTabs = useMemo(() => {
    const set = new Set<PrefetchTabKey>();
    if (liveSettings?.phase2LlmEnabled === false) {
      set.add('brand_resolver');
      set.add('search_planner');
      set.add('url_predictor');
    }
    if (liveSettings?.phase3LlmTriageEnabled === false) {
      set.add('serp_triage');
      set.add('domain_classifier');
    }
    return set;
  }, [liveSettings?.phase2LlmEnabled, liveSettings?.phase3LlmTriageEnabled]);

  const pools = useMemo(() => {
    const set = new Set(workers.map((w) => w.pool));
    return ['all', ...Array.from(set).sort()];
  }, [workers]);

  const filtered = useMemo(() => {
    const list = poolFilter === 'all' ? workers : workers.filter((w) => w.pool === poolFilter);
    return [...list].sort((a, b) => {
      if (a.state === 'stuck' && b.state !== 'stuck') return -1;
      if (b.state === 'stuck' && a.state !== 'stuck') return 1;
      if (a.state === 'running' && b.state !== 'running') return -1;
      if (b.state === 'running' && a.state !== 'running') return 1;
      return b.elapsed_ms - a.elapsed_ms;
    });
  }, [workers, poolFilter]);

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
    setPrefetchTab(tab);
  };

  const activeWorker = selectedWorker
    ? workers.find((w) => w.worker_id === selectedWorker.worker_id) ?? selectedWorker
    : null;

  const isPrefetchActive = prefetchTab !== null;
  const busyPrefetchTabs = useMemo(
    () => buildBusyPrefetchTabs({
      isRunning,
      activeTab: prefetchTab,
      prefetchData,
      tabKeys: PREFETCH_TAB_KEYS,
    }),
    [isRunning, prefetchTab, prefetchData],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PrefetchTabRow activeTab={prefetchTab} onSelectTab={handleSelectPrefetchTab} busyTabs={busyPrefetchTabs} disabledTabs={disabledPrefetchTabs} />

      <div className="px-4 py-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <label className="text-xs text-gray-500 dark:text-gray-400">Pool:</label>
        <select
          value={poolFilter}
          onChange={(e) => setPoolFilter(e.target.value)}
          className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
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
            renderPrefetchPanel(prefetchTab, prefetchData, category, liveSettings)
          ) : activeWorker ? (
            <WorkerLivePanel worker={activeWorker} wsUrl={wsUrl} isRunning={isRunning} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
              {workers.length === 0
                ? 'No workers active yet. Workers will appear when the run starts fetching.'
                : 'Select a worker from the tabs above'}
            </div>
          )}
        </div>

        <div className={isPrefetchActive ? 'relative' : ''}>
          {isPrefetchActive && (
            <div className="absolute inset-0 bg-gray-200/40 dark:bg-gray-900/40 z-10 pointer-events-none" />
          )}
          {activeWorker && (
            <WorkerDataDrawer
              runId={runId}
              workerId={activeWorker.worker_id}
              category={category}
              isOpen={drawerOpen && !isPrefetchActive}
              onToggle={toggleDrawerOpen}
              isRunning={isRunning}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function renderPrefetchPanel(tab: PrefetchTabKey, data: PreFetchPhasesResponse | undefined, persistScope: string, liveSettings: PrefetchLiveSettings | undefined) {
  const emptyNeedset = { needset_size: 0, total_fields: 0, identity_lock_state: { status: 'unlocked', confidence: 0 }, needs: [], reason_counts: {}, required_level_counts: {}, snapshots: [] };
  const emptyProfile = { query_count: 0, provider: '', llm_query_planning: false, identity_aliases: [], variant_guard_terms: [], query_rows: [], query_guard: {} };

  switch (tab) {
    case 'needset':
      return <PrefetchNeedSetPanel data={data?.needset ?? emptyNeedset} persistScope={persistScope} />;
    case 'search_profile':
      return <PrefetchSearchProfilePanel data={data?.search_profile ?? emptyProfile} searchPlans={data?.search_plans} persistScope={persistScope} liveSettings={liveSettings} />;
    case 'brand_resolver':
      return <PrefetchBrandResolverPanel calls={data?.llm_calls?.brand_resolver ?? []} brandResolution={data?.brand_resolution} persistScope={persistScope} liveSettings={liveSettings} />;
    case 'search_planner':
      return (
        <PrefetchSearchPlannerPanel
          calls={data?.llm_calls?.search_planner ?? []}
          searchPlans={data?.search_plans}
          searchResults={data?.search_results}
          liveSettings={liveSettings}
        />
      );
    case 'query_journey':
      return (
        <PrefetchQueryJourneyPanel
          searchProfile={data?.search_profile ?? emptyProfile}
          searchPlans={data?.search_plans}
          searchResults={data?.search_results}
          searchResultDetails={data?.search_result_details}
          persistScope={persistScope}
        />
      );
    case 'search_results':
      return <PrefetchSearchResultsPanel results={data?.search_results ?? []} searchResultDetails={data?.search_result_details} searchPlans={data?.search_plans} persistScope={persistScope} liveSettings={liveSettings} />;
    case 'url_predictor':
      return <PrefetchUrlPredictorPanel calls={data?.llm_calls?.url_predictor ?? []} urlPredictions={data?.url_predictions} persistScope={persistScope} liveSettings={liveSettings} />;
    case 'serp_triage':
      return <PrefetchSerpTriagePanel calls={data?.llm_calls?.serp_triage ?? []} serpTriage={data?.serp_triage} persistScope={persistScope} liveSettings={liveSettings} />;
    case 'domain_classifier':
      return <PrefetchDomainClassifierPanel calls={data?.llm_calls?.domain_classifier ?? []} domainHealth={data?.domain_health} persistScope={persistScope} liveSettings={liveSettings} />;
    default:
      return null;
  }
}
