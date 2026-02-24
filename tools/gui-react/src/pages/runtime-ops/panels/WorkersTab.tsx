import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { RuntimeOpsWorkerRow, PrefetchTabKey, PreFetchPhasesResponse } from '../types';
import { getRefetchInterval } from '../helpers';
import { WorkerSubTabs } from './WorkerSubTabs';
import { WorkerLivePanel } from './WorkerLivePanel';
import { WorkerDataDrawer } from './WorkerDataDrawer';
import { PrefetchTabRow } from './PrefetchTabRow';
import { PrefetchNeedSetPanel } from './PrefetchNeedSetPanel';
import { PrefetchSearchProfilePanel } from './PrefetchSearchProfilePanel';
import { PrefetchBrandResolverPanel } from './PrefetchBrandResolverPanel';
import { PrefetchSearchPlannerPanel } from './PrefetchSearchPlannerPanel';
import { PrefetchSearchResultsPanel } from './PrefetchSearchResultsPanel';
import { PrefetchUrlPredictorPanel } from './PrefetchUrlPredictorPanel';
import { PrefetchSerpTriagePanel } from './PrefetchSerpTriagePanel';
import { PrefetchDomainClassifierPanel } from './PrefetchDomainClassifierPanel';

interface WorkersTabProps {
  workers: RuntimeOpsWorkerRow[];
  selectedWorker: RuntimeOpsWorkerRow | null;
  onSelectWorker: (w: RuntimeOpsWorkerRow | null) => void;
  runId: string;
  isRunning: boolean;
  wsUrl?: string;
}

export function WorkersTab({ workers, selectedWorker, onSelectWorker, runId, isRunning, wsUrl }: WorkersTabProps) {
  const [poolFilter, setPoolFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [prefetchTab, setPrefetchTab] = useState<PrefetchTabKey | null>(null);

  const { data: prefetchData } = useQuery({
    queryKey: ['runtime-ops', runId, 'prefetch'],
    queryFn: () => api.get<PreFetchPhasesResponse>(`/indexlab/run/${runId}/runtime/prefetch`),
    enabled: Boolean(runId) && prefetchTab !== null,
    refetchInterval: getRefetchInterval(isRunning, prefetchTab === null, 3000, 15000),
  });

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
  }, [filtered.length]);

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

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PrefetchTabRow activeTab={prefetchTab} onSelectTab={handleSelectPrefetchTab} />

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
            renderPrefetchPanel(prefetchTab, prefetchData)
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
              isOpen={drawerOpen && !isPrefetchActive}
              onToggle={() => setDrawerOpen((o) => !o)}
              isRunning={isRunning}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function renderPrefetchPanel(tab: PrefetchTabKey, data: PreFetchPhasesResponse | undefined) {
  const emptyNeedset = { needset_size: 0, total_fields: 0, identity_lock_state: { status: 'unknown', confidence: 0 }, needs: [], reason_counts: {}, required_level_counts: {}, snapshots: [] };
  const emptyProfile = { query_count: 0, provider: '', llm_query_planning: false, identity_aliases: [], variant_guard_terms: [], query_rows: [], query_guard: {} };

  switch (tab) {
    case 'needset':
      return <PrefetchNeedSetPanel data={data?.needset ?? emptyNeedset} />;
    case 'search_profile':
      return <PrefetchSearchProfilePanel data={data?.search_profile ?? emptyProfile} searchPlans={data?.search_plans} />;
    case 'brand_resolver':
      return <PrefetchBrandResolverPanel calls={data?.llm_calls?.brand_resolver ?? []} brandResolution={data?.brand_resolution} />;
    case 'search_planner':
      return <PrefetchSearchPlannerPanel calls={data?.llm_calls?.search_planner ?? []} searchPlans={data?.search_plans} />;
    case 'search_results':
      return <PrefetchSearchResultsPanel results={data?.search_results ?? []} searchResultDetails={data?.search_result_details} />;
    case 'url_predictor':
      return <PrefetchUrlPredictorPanel calls={data?.llm_calls?.url_predictor ?? []} urlPredictions={data?.url_predictions} />;
    case 'serp_triage':
      return <PrefetchSerpTriagePanel calls={data?.llm_calls?.serp_triage ?? []} serpTriage={data?.serp_triage} />;
    case 'domain_classifier':
      return <PrefetchDomainClassifierPanel calls={data?.llm_calls?.domain_classifier ?? []} domainHealth={data?.domain_health} />;
    default:
      return null;
  }
}
