import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client.ts';
import { usePersistedTab } from '../../../../stores/tabStore.ts';
import type {
  RuntimeOpsWorkerRow,
  WorkerDataTab,
  WorkerDetailResponse,
} from '../../types.ts';
import { truncateUrl, poolBadgeClass, workerStateBadgeClass, formatMs } from '../../helpers.ts';
import { DrawerDocsTab } from './DrawerDocsTab.tsx';
import { DrawerExtractTab } from './DrawerExtractTab.tsx';
import { DrawerQueueTab } from './DrawerQueueTab.tsx';
import { DrawerShotsTab } from './DrawerShotsTab.tsx';
import { DrawerMetricsTab } from './DrawerMetricsTab.tsx';
import { DrawerPipelineTab } from './DrawerPipelineTab.tsx';

interface WorkerDataDrawerProps {
  runId: string;
  workerId: string;
  category: string;
  isOpen: boolean;
  onToggle: () => void;
  isRunning: boolean;
  worker?: RuntimeOpsWorkerRow | null;
}

const TABS: { key: WorkerDataTab; label: string }[] = [
  { key: 'documents', label: 'Docs' },
  { key: 'extraction', label: 'Extract' },
  { key: 'queue', label: 'Queue' },
  { key: 'screenshots', label: 'Shots' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'pipeline', label: 'Pipeline' },
];
const WORKER_DRAWER_TAB_KEYS = [
  'documents',
  'extraction',
  'queue',
  'screenshots',
  'metrics',
  'pipeline',
] as const satisfies ReadonlyArray<WorkerDataTab>;

export function WorkerDataDrawer({
  runId,
  workerId,
  category,
  isOpen,
  onToggle,
  isRunning,
  worker,
}: WorkerDataDrawerProps) {
  const [activeTab, setActiveTab] = usePersistedTab<WorkerDataTab>(
    `runtimeOps:workers:drawerTab:${category}`,
    'documents',
    { validValues: WORKER_DRAWER_TAB_KEYS },
  );

  const { data } = useQuery({
    queryKey: ['runtime-ops', runId, 'worker-detail', workerId],
    queryFn: () => api.get<WorkerDetailResponse>(
      `/indexlab/run/${runId}/runtime/workers/${encodeURIComponent(workerId)}`,
    ),
    enabled: Boolean(runId && workerId && isOpen),
    refetchInterval: isRunning ? 3000 : false,
  });

  const handleCopyUrl = useCallback(() => {
    if (worker?.current_url) {
      navigator.clipboard.writeText(worker.current_url).catch(() => {});
    }
  }, [worker?.current_url]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="w-10 h-full min-h-0 shrink-0 border-l sf-border-soft flex flex-col items-center justify-center gap-2 sf-surface-panel sf-text-muted hover:sf-text-primary transition-colors"
        title="Open worker detail drawer"
        aria-label="Open worker detail drawer"
        aria-expanded="false"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span className="sf-text-caption font-medium tracking-widest uppercase" style={{ writingMode: 'vertical-rl' }}>Detail</span>
      </button>
    );
  }

  return (
    <div className="w-[36rem] shrink-0 border-l sf-border-soft flex flex-col min-h-0">
      {/* Worker identity banner */}
      {worker && (
        <div className="px-3 py-2 border-b sf-border-soft sf-surface-panel text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono sf-chip-neutral px-1.5 py-0.5 rounded">{worker.worker_id}</span>
            <span className={`px-1.5 py-0.5 rounded ${poolBadgeClass(worker.pool)}`}>{worker.pool}</span>
            <span className={`px-1.5 py-0.5 rounded ${workerStateBadgeClass(worker.state)}`}>{worker.state}</span>
            {worker.elapsed_ms > 0 && (
              <span className="sf-text-muted font-mono ml-auto">{formatMs(worker.elapsed_ms)}</span>
            )}
          </div>
          {worker.current_url && (
            <button
              type="button"
              className="font-mono sf-text-muted truncate block max-w-full text-left sf-text-nano"
              title={`Click to copy: ${worker.current_url}`}
              onClick={handleCopyUrl}
            >
              {truncateUrl(worker.current_url, 70)}
            </button>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center px-3 py-2 border-b sf-border-soft">
        <div className="flex gap-1 flex-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === t.key
                  ? 'sf-chip-info'
                  : 'sf-text-subtle'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="ml-2 shrink-0 inline-flex items-center justify-center w-7 h-7 rounded sf-surface-elevated sf-text-subtle hover:sf-text-primary sf-border-soft border transition-colors"
          title="Collapse drawer"
          aria-label="Close worker detail drawer"
          aria-expanded="true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'documents' && (
          <DrawerDocsTab
            documents={data?.documents ?? []}
            extractionFields={data?.extraction_fields ?? []}
            screenshots={data?.screenshots ?? []}
            queueJobs={data?.queue_jobs ?? []}
            runId={runId}
            isRunning={isRunning}
            category={category}
          />
        )}
        {activeTab === 'extraction' && (
          <DrawerExtractTab
            fields={data?.extraction_fields ?? []}
            indexedFieldNames={data?.indexed_field_names ?? []}
            category={category}
          />
        )}
        {activeTab === 'queue' && <DrawerQueueTab jobs={data?.queue_jobs ?? []} />}
        {activeTab === 'screenshots' && (
          <DrawerShotsTab
            screenshots={data?.screenshots ?? []}
            runId={runId}
            workerId={workerId}
            isRunning={isRunning}
          />
        )}
        {activeTab === 'metrics' && <DrawerMetricsTab data={data} />}
        {activeTab === 'pipeline' && <DrawerPipelineTab data={data} />}
      </div>
    </div>
  );
}
