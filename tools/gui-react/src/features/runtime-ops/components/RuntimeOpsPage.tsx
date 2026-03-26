import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { wsManager } from '../../../api/ws.ts';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import type { ProcessStatus } from '../../../types/events.ts';
import { useUiStore } from '../../../stores/uiStore.ts';
import { usePersistedNullableTab, usePersistedTab } from '../../../stores/tabStore.ts';
import { useIndexLabStore } from '../../indexing/state/indexlabStore.ts';
import { buildIndexLabRunsQueryKey, buildIndexLabRunsRequestPath } from '../../indexing/state/indexlabRunsQuery.ts';
import type { IndexLabRunSummary, IndexLabRunsResponse } from '../../indexing/types.ts';
import { resolveRunActiveScope } from '../selectors/runActivityScopeHelpers.js';
import { BootProgressBar } from './BootProgressBar.tsx';
import { MetricsRail } from '../panels/overview/MetricsRail.tsx';
import { OverviewTab } from '../panels/overview/OverviewTab.tsx';
import { WorkersTab } from '../panels/workers/WorkersTab.tsx';
import { DocumentsTab } from '../panels/overview/DocumentsTab.tsx';
import { FallbacksTab } from '../panels/overview/FallbacksTab.tsx';
import { QueueTab } from '../panels/overview/QueueTab.tsx';
import { CompoundTab } from '../panels/compound/CompoundTab.tsx';
import { RuntimeOpsRunPicker } from './RuntimeOpsRunPicker.tsx';
import type {
  RuntimeOpsTab,
  RuntimeOpsSummaryResponse,
  RuntimeOpsWorkersResponse,
  RuntimeOpsDocumentsResponse,
  RuntimeOpsMetricsResponse,
  FallbacksResponse,
  QueueStateResponse,
} from '../types.ts';

const TAB_DEFS = [
  { id: 'overview', label: 'Overview', description: 'Health cards, throughput, blockers' },
  { id: 'workers', label: 'Workers', description: 'Live worker table with stuck detection' },
  { id: 'documents', label: 'Documents', description: 'Document lifecycle tracing' },
  { id: 'fallbacks', label: 'Fallbacks', description: 'Fetch mode transitions and host degradation' },
  { id: 'queue', label: 'Queue', description: 'Repair queue lanes and job inspection' },
  { id: 'compound', label: 'Compound', description: 'Cross-run learning curves and index analytics' },
] as const;

const RUNTIME_OPS_TAB_KEYS = [
  'overview',
  'workers',
  'documents',
  'fallbacks',
  'queue',
  'compound',
] as const satisfies ReadonlyArray<RuntimeOpsTab>;

import { TabStrip } from '../../../shared/ui/navigation/TabStrip.tsx';

function getRefetchInterval(
  isRunning: boolean,
  isInactive: boolean,
  activeMs = 2000,
  idleMs = 10000,
): number | false {
  if (isInactive) return false;
  return isRunning ? activeMs : idleMs;
}

function toToken(value: unknown): string {
  return String(value || '').trim();
}

function titleCaseWords(value = ''): string {
  const words = toToken(value).split(/\s+/).filter(Boolean);
  return words.map((word) => {
    if (/\d/.test(word)) {
      return word.toUpperCase();
    }
    const lower = word.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

function humanizeProductId({
  category = '',
  productId = '',
}: {
  category?: string;
  productId?: string;
}): string {
  const categoryToken = toToken(category).toLowerCase();
  let productToken = toToken(productId);
  if (categoryToken && productToken.toLowerCase().startsWith(`${categoryToken}-`)) {
    productToken = productToken.slice(categoryToken.length + 1);
  }
  const humanized = titleCaseWords(productToken.replace(/[_-]+/g, ' '));
  return humanized || titleCaseWords(categoryToken);
}

function toRunDisplayToken(runId = ''): string {
  const token = toToken(runId);
  if (!token) return '';
  if (token.length <= 5) return token;
  const segments = token.split(/[^A-Za-z0-9]+/).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = toToken(segments[index]);
    if (segment.length >= 5) {
      return segment.slice(-5);
    }
  }
  return token.slice(-5);
}

function buildRunPickerLabel({
  category = '',
  productId = '',
  brand = '',
  model = '',
  variant = '',
  runId = '',
}: {
  category?: string;
  productId?: string;
  brand?: string;
  model?: string;
  variant?: string;
  runId?: string;
}): string {
  const categoryLabel = titleCaseWords(category);
  const identityLabel = [brand, model, variant].map(toToken).filter(Boolean).join(' ')
    || humanizeProductId({ category, productId });
  const dedupedIdentityLabel = identityLabel.toLowerCase() === categoryLabel.toLowerCase()
    ? ''
    : identityLabel;
  const runToken = toRunDisplayToken(runId);
  const lead = [categoryLabel, dedupedIdentityLabel].filter(Boolean).join(' • ');
  if (!lead) return runToken;
  return runToken ? `${lead} - ${runToken}` : lead;
}

function resolveStorageDestination(status: ProcessStatus | undefined): 'local' | 's3' {
  return toToken(status?.storageDestination || status?.storage_destination).toLowerCase() === 's3'
    ? 's3'
    : 'local';
}

function resolveStorageState(status: ProcessStatus | undefined): 'live' | 'relocating' | 'stored' {
  if (status?.relocating) return 'relocating';
  if (status?.running) return 'live';
  return 'stored';
}

export function RuntimeOpsPage() {
  const category = useUiStore((s) => s.category);
  const categoryScope = category === 'all' ? '' : category;
  const selectedRunId = useIndexLabStore((s) => s.pickerRunId);
  const setSelectedRunId = useIndexLabStore((s) => s.setPickerRunId);
  const [activeTab, setActiveTab] = usePersistedTab<RuntimeOpsTab>(
    'runtimeOps:tab:main',
    'overview',
    { validValues: RUNTIME_OPS_TAB_KEYS },
  );
  const [throughputHistory, setThroughputHistory] = useState<Array<{ ts: string; docs: number; fields: number }>>([]);

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

  const {
    data: runsResp,
    isLoading: runsLoading,
    isFetching: runsFetching,
  } = useQuery({
    queryKey: buildIndexLabRunsQueryKey({ category: categoryScope, limit: 40 }),
    queryFn: () => api.get<IndexLabRunsResponse>(buildIndexLabRunsRequestPath({ category: categoryScope, limit: 40 })),
    refetchInterval: getRefetchInterval(isRunning, false, 3000, 15000),
  });

  const runs = useMemo(() => {
    return runsResp?.runs ?? [];
  }, [runsResp]);

  const effectiveRunId = selectedRunId || processStatusRunId || runs[0]?.run_id || '';

  const runOptions = useMemo<IndexLabRunSummary[]>(() => {
    const rows = runs.map((row) => {
      if (row.run_id === processStatusRunId) {
        return {
          ...row,
          storage_origin: resolveStorageDestination(processStatus),
          storage_state: resolveStorageState(processStatus),
        };
      }
      return {
        ...row,
        storage_state: row.storage_state || (row.status === 'running' || row.status === 'starting' ? 'live' : 'stored'),
      };
    });
    if (effectiveRunId && !rows.some((row) => row.run_id === effectiveRunId)) {
      const fallbackCategory = toToken(processStatus?.category || categoryScope || category);
      const fallbackProductId = toToken(processStatus?.product_id || processStatus?.productId);
      rows.unshift({
        run_id: effectiveRunId,
        category: fallbackCategory,
        product_id: fallbackProductId,
        started_at: String(processStatus?.startedAt || ''),
        ended_at: '',
        status: processStatus?.relocating ? 'relocating' : (isRunning ? 'running' : 'starting'),
        storage_origin: resolveStorageDestination(processStatus),
        storage_state: resolveStorageState(processStatus),
        picker_label: buildRunPickerLabel({
          category: fallbackCategory,
          productId: fallbackProductId,
          brand: toToken(processStatus?.brand),
          model: toToken(processStatus?.model),
          variant: toToken(processStatus?.variant),
          runId: effectiveRunId,
        }),
      });
    }
    return rows;
  }, [runs, effectiveRunId, processStatusRunId, processStatus, categoryScope, category, isRunning]);

  const hasRuns = runOptions.length > 0;
  const showRunsLoadingState = runsLoading && !hasRuns;
  const showNoRunsState = !runsLoading && !hasRuns;

  useEffect(() => {
    if (!effectiveRunId || selectedRunId === effectiveRunId) return;
    setSelectedRunId(effectiveRunId);
  }, [effectiveRunId, selectedRunId, setSelectedRunId]);

  // WHY: Push-based updates — when the pipeline emits runtime events, the WS
  // channel delivers a lightweight signal and we invalidate cached queries
  // so the panel re-fetches immediately instead of waiting for the poll interval.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!effectiveRunId) return;
    wsManager.subscribe(['indexlab-event'], categoryScope);
    const unsub = wsManager.onMessage((channel) => {
      if (channel === 'indexlab-event') {
        queryClient.invalidateQueries({ queryKey: ['runtime-ops', effectiveRunId] });
      }
    });
    return unsub;
  }, [effectiveRunId, categoryScope, queryClient]);

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

  const runHeaderStatus = useMemo(() => {
    if (runsLoading) {
      return { text: 'Loading run history...', spinner: true, tone: 'muted' as const };
    }
    if (selectedRun?.storage_state === 'relocating' || selectedRun?.status === 'relocating') {
      return { text: 'Relocating run artifacts...', spinner: true, tone: 'warning' as const };
    }
    // WHY: Only show "Starting..." when process is genuinely transitioning —
    // processStatus reports the run but isRunning hasn't flipped yet.
    if (selectedRun?.status === 'starting' && processStatusRunId === effectiveRunId && !isRunning) {
      return { text: 'Starting...', spinner: true, tone: 'muted' as const };
    }
    if (isSelectedRunActive) {
      // WHY: During boot (phase_00_bootstrap) or before first poll,
      // show spinner + progress bar. Prefetch tabs take over at needset.
      if (!summary || summary.phase_cursor === 'phase_00_bootstrap') {
        return { text: '', spinner: true, tone: 'muted' as const };
      }
      return { text: 'Live', spinner: false, tone: 'success' as const };
    }
    return null;
  }, [runsLoading, selectedRun?.status, selectedRun?.storage_state, isSelectedRunActive, processStatusRunId, effectiveRunId, isRunning, summary?.phase_cursor]);

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
    setThroughputHistory((prev) => {
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
    `runtimeOps:workers:selectedWorker:${category}:${effectiveRunId || 'pending'}`,
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

  const { data: fallbacksResp } = useQuery({
    queryKey: ['runtime-ops', effectiveRunId, 'fallbacks'],
    queryFn: () => api.get<FallbacksResponse>(`/indexlab/run/${effectiveRunId}/runtime/fallbacks`),
    enabled: Boolean(effectiveRunId) && activeTab === 'fallbacks',
    refetchInterval: getRefetchInterval(isSelectedRunActive, activeTab !== 'fallbacks', 2000, 10000),
  });

  const { data: queueResp } = useQuery({
    queryKey: ['runtime-ops', effectiveRunId, 'queue'],
    queryFn: () => api.get<QueueStateResponse>(`/indexlab/run/${effectiveRunId}/runtime/queue`),
    enabled: Boolean(effectiveRunId) && activeTab === 'queue',
    refetchInterval: getRefetchInterval(isSelectedRunActive, activeTab !== 'queue', 2000, 10000),
  });

  const handleNavigateToDocument = (_url: string) => {
    setActiveTab('documents');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-end gap-4 border-b sf-border-default sf-surface-shell px-4">
        <div className="flex flex-col py-2">
          <div className="flex min-h-5 items-center gap-2 pb-1">
            {runHeaderStatus ? (
              <>
                {runHeaderStatus.spinner ? <Spinner className="h-3.5 w-3.5" /> : null}
                {runHeaderStatus.text ? (
                  <span className={`sf-text-caption ${
                    runHeaderStatus.tone === 'success'
                      ? 'sf-status-text-success'
                      : runHeaderStatus.tone === 'warning'
                        ? 'sf-status-text-warning'
                        : 'sf-text-muted'
                  }`}>
                    {runHeaderStatus.text}
                  </span>
                ) : null}
              </>
            ) : null}
            {isSelectedRunActive && (!summary || summary.phase_cursor === 'phase_00_bootstrap') && (
              <BootProgressBar step={summary?.boot_step ?? 'config'} progress={summary?.boot_progress ?? 0} />
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <label className="shrink-0 sf-text-caption sf-text-muted font-medium">Run:</label>
            <div className="min-w-0">
              <RuntimeOpsRunPicker
                runs={runOptions}
                value={effectiveRunId}
                onChange={setSelectedRunId}
                isLoading={runsLoading}
                isRefreshing={runsFetching && !runsLoading}
              />
            </div>
          </div>
        </div>

        <TabStrip
          tabs={TAB_DEFS}
          activeTab={activeTab}
          onSelect={setActiveTab}
          className="flex shrink-0 gap-1 px-1 py-1 sf-tab-strip rounded"
        />
      </div>

      <div className="flex flex-1 min-h-0">
        <MetricsRail data={metricsResp} />

        <div className="flex flex-1 min-h-0 min-w-0 flex-col">
          {showRunsLoadingState ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8">
              <div className="sf-text-caption sf-text-muted">Loading runtime runs…</div>
            </div>
          ) : showNoRunsState ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8">
              <div className="text-4xl opacity-30">{`\u2699\uFE0F`}</div>
              <div className="text-center max-w-md">
                <h2 className="text-lg font-semibold sf-text-primary mb-2">Runtime Ops Workbench</h2>
                <p className="text-sm sf-text-muted mb-4">
                  This page shows live diagnostics for IndexLab runs - worker status, document lifecycle, pool metrics, and failure tracking.
                </p>
                <p className="text-sm sf-text-muted">
                  Start an IndexLab run to populate this view. The workbench will auto-refresh once a run is detected.
                </p>
                <div className="mt-4 p-3 sf-pre-block rounded sf-text-caption text-left font-mono">
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
                  onNavigateToWorkers={(_pool) => {
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
                  browserPoolMeta={(summary as Record<string, unknown> | undefined)?.browser_pool as { status?: string; browsers?: number; slots?: number; pages_per_browser?: number } | null | undefined}
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
              {activeTab === 'compound' && (
                <CompoundTab
                  category={category}
                  runs={runs}
                  isRunning={isSelectedRunActive}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
