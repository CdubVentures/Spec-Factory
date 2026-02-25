import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useUiStore } from '../../stores/uiStore';
import { usePersistedNullableTab, usePersistedTab } from '../../stores/tabStore';
import { useIndexLabStore } from '../../stores/indexlabStore';
import { getRefetchInterval } from './helpers';
import { resolveRunActiveScope } from './runActivityScopeHelpers.js';
import { MetricsRail } from './panels/MetricsRail';
import { OverviewTab } from './panels/OverviewTab';
import { WorkersTab } from './panels/WorkersTab';
import { DocumentsTab } from './panels/DocumentsTab';
import { ExtractionTab } from './panels/ExtractionTab';
import { FallbacksTab } from './panels/FallbacksTab';
import { QueueTab } from './panels/QueueTab';
import type {
  RuntimeOpsTab,
  RuntimeOpsSummaryResponse,
  RuntimeOpsWorkersResponse,
  RuntimeOpsDocumentsResponse,
  RuntimeOpsMetricsResponse,
  ExtractionFieldsResponse,
  FallbacksResponse,
  QueueStateResponse,
} from './types';

interface ProcessStatus {
  running: boolean;
  run_id?: string | null;
  runId?: string | null;
  startedAt?: string | null;
}

interface IndexLabRunsResponse {
  runs: Array<{ run_id: string; category: string; started_at: string; status: string }>;
}

const TAB_DEFS: { key: RuntimeOpsTab; label: string; desc: string }[] = [
  { key: 'overview', label: 'Overview', desc: 'Health cards, throughput, blockers' },
  { key: 'workers', label: 'Workers', desc: 'Live worker table with stuck detection' },
  { key: 'documents', label: 'Documents', desc: 'Document lifecycle tracing' },
  { key: 'extraction', label: 'Extraction', desc: 'Field extraction matrix and method lineage' },
  { key: 'fallbacks', label: 'Fallbacks', desc: 'Fetch mode transitions and host degradation' },
  { key: 'queue', label: 'Queue', desc: 'Repair queue lanes and job inspection' },
];
const RUNTIME_OPS_TAB_KEYS = [
  'overview',
  'workers',
  'documents',
  'extraction',
  'fallbacks',
  'queue',
] as const satisfies ReadonlyArray<RuntimeOpsTab>;

const tabCls = 'px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer';
const activeTabCls = 'border-accent text-accent dark:border-accent-dark dark:text-accent-dark';
const inactiveTabCls = 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200';

export function RuntimeOpsPage() {
  const category = useUiStore((s) => s.category);
  const selectedRunId = useIndexLabStore((s) => s.pickerRunId);
  const setSelectedRunId = useIndexLabStore((s) => s.setPickerRunId);
  const [activeTab, setActiveTab] = usePersistedTab<RuntimeOpsTab>(
    'runtimeOps:tab:main',
    'overview',
    { validValues: RUNTIME_OPS_TAB_KEYS },
  );
  const [throughputHistory, setThroughputHistory] = useState<{ ts: string; docs: number; fields: number }[]>([]);

  const wsUrl = useMemo(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }, []);

  const { data: processStatus } = useQuery({
    queryKey: ['processStatus'],
    queryFn: () => api.get<ProcessStatus>('/process/status'),
    refetchInterval: 1500,
  });
  const isRunning = Boolean(processStatus?.running);
  const processStatusRunId = String(processStatus?.run_id || processStatus?.runId || '').trim();

  const { data: runsResp } = useQuery({
    queryKey: ['indexlab', 'runs'],
    queryFn: () => api.get<IndexLabRunsResponse>('/indexlab/runs?limit=40'),
    refetchInterval: getRefetchInterval(isRunning, false, 3000, 15000),
  });

  const runs = useMemo(() => {
    const rows = runsResp?.runs ?? [];
    if (category === 'all') return rows;
    return rows.filter((r) => r.category === category);
  }, [runsResp, category]);
  const effectiveRunId = selectedRunId || processStatusRunId || runs[0]?.run_id || '';
  const runOptions = useMemo(() => {
    const rows = [...runs];
    if (effectiveRunId && !rows.some((row) => row.run_id === effectiveRunId)) {
      rows.unshift({
        run_id: effectiveRunId,
        category,
        started_at: String(processStatus?.startedAt || ''),
        status: isRunning ? 'running' : 'starting',
      });
    }
    return rows;
  }, [runs, effectiveRunId, category, processStatus?.startedAt, isRunning]);
  const hasRuns = runOptions.length > 0;
  useEffect(() => {
    if (!effectiveRunId || selectedRunId === effectiveRunId) return;
    setSelectedRunId(effectiveRunId);
  }, [effectiveRunId, selectedRunId, setSelectedRunId]);
  const selectedRun = useMemo(
    () => runOptions.find((run) => run.run_id === effectiveRunId) ?? null,
    [runOptions, effectiveRunId],
  );
  const isSelectedRunActive = resolveRunActiveScope({
    processRunning: isRunning,
    selectedRunStatus: selectedRun?.status,
  });

  const { data: summary } = useQuery({
    queryKey: ['runtime-ops', effectiveRunId, 'summary'],
    queryFn: () => api.get<RuntimeOpsSummaryResponse>(`/indexlab/run/${effectiveRunId}/runtime/summary`),
    enabled: Boolean(effectiveRunId),
    refetchInterval: getRefetchInterval(isSelectedRunActive, activeTab !== 'overview', 2000, 10000),
  });

  const blockerValidValues = useMemo(
    () => (summary?.top_blockers ?? []).map((blocker) => blocker.host),
    [summary?.top_blockers],
  );
  const [selectedBlockerHost, setSelectedBlockerHost] = usePersistedNullableTab<string>(
    `runtimeOps:overview:selectedBlocker:${category}`,
    null,
    { validValues: blockerValidValues },
  );
  const selectedBlocker = useMemo(() => {
    if (!selectedBlockerHost) return null;
    return (summary?.top_blockers ?? []).find((blocker) => blocker.host === selectedBlockerHost) ?? null;
  }, [selectedBlockerHost, summary?.top_blockers]);

  useEffect(() => {
    if (!summary) return;
    setThroughputHistory(prev => {
      const point = { ts: new Date().toISOString(), docs: summary.docs_per_min, fields: summary.fields_per_min };
      const next = [...prev, point];
      return next.length > 60 ? next.slice(-60) : next;
    });
  }, [summary?.docs_per_min, summary?.fields_per_min]);

  const { data: workersResp } = useQuery({
    queryKey: ['runtime-ops', effectiveRunId, 'workers'],
    queryFn: () => api.get<RuntimeOpsWorkersResponse>(`/indexlab/run/${effectiveRunId}/runtime/workers`),
    enabled: Boolean(effectiveRunId) && activeTab === 'workers',
    refetchInterval: getRefetchInterval(isSelectedRunActive, activeTab !== 'workers', 2000, 10000),
  });

  const workerValidValues = useMemo(
    () => (workersResp?.workers ?? []).map((worker) => worker.worker_id),
    [workersResp?.workers],
  );
  const [selectedWorkerId, setSelectedWorkerId] = usePersistedNullableTab<string>(
    `runtimeOps:workers:selectedWorker:${category}`,
    null,
    { validValues: workerValidValues },
  );
  const selectedWorker = useMemo(() => {
    if (!selectedWorkerId) return null;
    return (workersResp?.workers ?? []).find((worker) => worker.worker_id === selectedWorkerId) ?? null;
  }, [selectedWorkerId, workersResp?.workers]);

  const { data: documentsResp } = useQuery({
    queryKey: ['runtime-ops', effectiveRunId, 'documents'],
    queryFn: () => api.get<RuntimeOpsDocumentsResponse>(`/indexlab/run/${effectiveRunId}/runtime/documents?limit=200`),
    enabled: Boolean(effectiveRunId) && activeTab === 'documents',
    refetchInterval: getRefetchInterval(isSelectedRunActive, activeTab !== 'documents', 2000, 10000),
  });

  const { data: metricsResp } = useQuery({
    queryKey: ['runtime-ops', effectiveRunId, 'metrics'],
    queryFn: () => api.get<RuntimeOpsMetricsResponse>(`/indexlab/run/${effectiveRunId}/runtime/metrics`),
    enabled: Boolean(effectiveRunId),
    refetchInterval: getRefetchInterval(isSelectedRunActive, false, 2000, 10000),
  });

  const { data: extractionResp } = useQuery({
    queryKey: ['runtime-ops', effectiveRunId, 'extraction'],
    queryFn: () => api.get<ExtractionFieldsResponse>(
      `/indexlab/run/${effectiveRunId}/runtime/extraction/fields`,
    ),
    enabled: Boolean(effectiveRunId) && activeTab === 'extraction',
    refetchInterval: getRefetchInterval(isSelectedRunActive, activeTab !== 'extraction', 2000, 10000),
  });

  const { data: fallbacksResp } = useQuery({
    queryKey: ['runtime-ops', effectiveRunId, 'fallbacks'],
    queryFn: () => api.get<FallbacksResponse>(
      `/indexlab/run/${effectiveRunId}/runtime/fallbacks`,
    ),
    enabled: Boolean(effectiveRunId) && activeTab === 'fallbacks',
    refetchInterval: getRefetchInterval(isSelectedRunActive, activeTab !== 'fallbacks', 2000, 10000),
  });

  const { data: queueResp } = useQuery({
    queryKey: ['runtime-ops', effectiveRunId, 'queue'],
    queryFn: () => api.get<QueueStateResponse>(
      `/indexlab/run/${effectiveRunId}/runtime/queue`,
    ),
    enabled: Boolean(effectiveRunId) && activeTab === 'queue',
    refetchInterval: getRefetchInterval(isSelectedRunActive, activeTab !== 'queue', 2000, 10000),
  });

  const handleNavigateToDocument = (url: string) => {
    setActiveTab('documents');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header bar: run selector + tab nav */}
      <div className="flex items-center border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4">
        <div className="flex items-center gap-2 mr-4 py-2">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Run:</label>
          {hasRuns ? (
            <select
              value={effectiveRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 max-w-[16rem] truncate"
            >
              {runOptions.map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.run_id} ({r.status})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">
              No runs yet
            </span>
          )}
          {isSelectedRunActive && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
        </div>

        <nav className="flex">
          {TAB_DEFS.map((t) => (
            <button
              key={t.key}
              type="button"
              title={t.desc}
              onClick={() => setActiveTab(t.key)}
              className={`${tabCls} ${activeTab === t.key ? activeTabCls : inactiveTabCls}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 3-pane body: metrics rail | center tab content | right inspector */}
      <div className="flex flex-1 min-h-0">
        <MetricsRail data={metricsResp} />

        <div className="flex flex-1 min-h-0 min-w-0 flex-col">
          {!hasRuns ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8">
              <div className="text-4xl opacity-30">
                {'\u2699\uFE0F'}
              </div>
              <div className="text-center max-w-md">
                <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Runtime Ops Workbench
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  This page shows live diagnostics for IndexLab runs — worker status, document lifecycle, pool metrics, and failure tracking.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Start an IndexLab run to populate this view. The workbench will auto-refresh once a run is detected.
                </p>
                <div className="mt-4 p-3 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-xs text-left font-mono text-gray-600 dark:text-gray-400">
                  npm run run:indexlab -- --category mouse --seed &quot;https://...&quot;
                </div>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewTab
                  summary={summary}
                  selectedBlocker={selectedBlocker}
                  onSelectBlocker={(blocker) => setSelectedBlockerHost(blocker?.host ?? null)}
                  throughputHistory={throughputHistory}
                  runId={effectiveRunId}
                  isRunning={isSelectedRunActive}
                  onNavigateToWorkers={(pool) => {
                    setActiveTab('workers');
                  }}
                />
              )}
              {activeTab === 'workers' && (
                <WorkersTab
                  workers={workersResp?.workers ?? []}
                  selectedWorker={selectedWorker}
                  onSelectWorker={(worker) => setSelectedWorkerId(worker?.worker_id ?? null)}
                  runId={effectiveRunId}
                  category={category}
                  isRunning={isSelectedRunActive}
                  wsUrl={wsUrl}
                />
              )}
              {activeTab === 'documents' && (
                <DocumentsTab
                  documents={documentsResp?.documents ?? []}
                  runId={effectiveRunId}
                  category={category}
                  isRunning={isSelectedRunActive}
                />
              )}
              {activeTab === 'extraction' && (
                <ExtractionTab
                  fields={extractionResp?.fields ?? []}
                  category={category}
                  onNavigateToDocument={handleNavigateToDocument}
                />
              )}
              {activeTab === 'fallbacks' && (
                <FallbacksTab
                  fallbacks={fallbacksResp}
                  category={category}
                  onNavigateToDocuments={handleNavigateToDocument}
                />
              )}
              {activeTab === 'queue' && (
                <QueueTab
                  queueState={queueResp}
                  category={category}
                  onNavigateToDocuments={handleNavigateToDocument}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
