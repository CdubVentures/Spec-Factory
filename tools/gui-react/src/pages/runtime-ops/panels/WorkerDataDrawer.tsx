import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { usePersistedTab } from '../../../stores/tabStore';
import type { WorkerDataTab, WorkerDetailResponse, WorkerExtractionField, WorkerScreenshot } from '../types';
import { formatBytes, truncateUrl, fieldStatusBadgeClass, queueStatusBadgeClass, formatMs } from '../helpers';

interface WorkerDataDrawerProps {
  runId: string;
  workerId: string;
  category: string;
  isOpen: boolean;
  onToggle: () => void;
  isRunning: boolean;
}

const TABS: { key: WorkerDataTab; label: string }[] = [
  { key: 'documents', label: 'Docs' },
  { key: 'extraction', label: 'Extract' },
  { key: 'queue', label: 'Queue' },
  { key: 'screenshots', label: 'Shots' },
  { key: 'metrics', label: 'Metrics' },
];
const WORKER_DRAWER_TAB_KEYS = [
  'documents',
  'extraction',
  'queue',
  'screenshots',
  'metrics',
] as const satisfies ReadonlyArray<WorkerDataTab>;

export function WorkerDataDrawer({
  runId,
  workerId,
  category,
  isOpen,
  onToggle,
  isRunning,
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

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="w-8 shrink-0 border-l sf-border-soft flex items-center justify-center sf-row-hoverable sf-text-subtle"
        title="Open worker detail drawer"
      >
        <span className="text-xs rotate-90 whitespace-nowrap">Details</span>
      </button>
    );
  }

  return (
    <div className="w-80 shrink-0 border-l sf-border-soft flex flex-col min-h-0">
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
          className="ml-1 px-1.5 py-1 rounded sf-icon-button sf-text-subtle text-xs"
          title="Close drawer"
        >
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'documents' && <DocumentsList documents={data?.documents ?? []} />}
        {activeTab === 'extraction' && <ExtractionList fields={data?.extraction_fields ?? []} />}
        {activeTab === 'queue' && <QueueList jobs={data?.queue_jobs ?? []} />}
        {activeTab === 'screenshots' && <ScreenshotsList screenshots={data?.screenshots ?? []} runId={runId} />}
        {activeTab === 'metrics' && <MetricsSummary data={data} />}
      </div>
    </div>
  );
}

function DocumentsList({ documents }: { documents: WorkerDetailResponse['documents'] }) {
  if (documents.length === 0) {
    return <div className="text-xs sf-text-subtle text-center py-4">No documents</div>;
  }

  return (
    <div className="space-y-2">
      {documents.map((d) => (
        <div key={d.url} className="sf-surface-elevated p-2 text-xs">
          <div className="font-mono sf-text-primary break-all mb-1">{truncateUrl(d.url, 60)}</div>
          <div className="flex items-center gap-2 sf-text-subtle">
            <span className={`px-1 py-0.5 rounded ${fieldStatusBadgeClass(d.status)}`}>{d.status}</span>
            {d.status_code && <span>{d.status_code}</span>}
            {d.bytes != null && <span>{formatBytes(d.bytes)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExtractionList({ fields }: { fields: WorkerExtractionField[] }) {
  if (fields.length === 0) {
    return <div className="text-xs sf-text-subtle text-center py-4">No fields extracted</div>;
  }

  return (
    <div className="space-y-1">
      {fields.map((f, i) => (
        <div key={`${f.field}-${i}`} className="flex items-center justify-between sf-surface-elevated px-2 py-1.5 text-xs">
          <div>
            <span className="font-medium sf-text-primary">{f.field}</span>
            <span className="ml-2 sf-text-muted">{f.value ?? '-'}</span>
          </div>
          <span className="sf-text-subtle font-mono">{Math.round(f.confidence * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function QueueList({ jobs }: { jobs: WorkerDetailResponse['queue_jobs'] }) {
  if (jobs.length === 0) {
    return <div className="text-xs sf-text-subtle text-center py-4">No queue jobs</div>;
  }

  return (
    <div className="space-y-2">
      {jobs.map((j) => (
        <div key={j.id} className="sf-surface-elevated p-2 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-1 py-0.5 rounded ${queueStatusBadgeClass(j.status)}`}>{j.status}</span>
            <span className="sf-text-subtle">{j.lane}</span>
          </div>
          <div className="font-mono sf-text-muted break-all">{truncateUrl(j.url, 50)}</div>
          {j.reason && <div className="sf-text-subtle mt-1">{j.reason}</div>}
        </div>
      ))}
    </div>
  );
}

function ScreenshotsList({ screenshots, runId }: { screenshots: WorkerScreenshot[]; runId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (screenshots.length === 0) {
    return <div className="text-xs sf-text-subtle text-center py-4">No screenshots</div>;
  }

  return (
    <div className="space-y-2">
      {screenshots.map((s) => (
        <div key={s.filename} className="sf-surface-elevated overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded(expanded === s.filename ? null : s.filename)}
            className="w-full text-left p-2 text-xs sf-row-hoverable"
          >
            <div className="font-mono sf-text-muted truncate">{s.filename}</div>
            <div className="sf-text-subtle">{s.width}x{s.height} &middot; {formatBytes(s.bytes)}</div>
          </button>
          {expanded === s.filename && (
            <div className="border-t sf-border-soft p-2 sf-surface-panel">
              <img
                src={`/api/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(s.filename)}`}
                alt={s.filename}
                className="w-full rounded"
                loading="lazy"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MetricsSummary({ data }: { data: WorkerDetailResponse | undefined }) {
  const docs = data?.documents ?? [];
  const fields = data?.extraction_fields ?? [];
  const totalBytes = docs.reduce((sum, d) => sum + (d.bytes ?? 0), 0);
  const avgConfidence = fields.length > 0
    ? fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length
    : 0;

  return (
    <div className="space-y-3 text-xs">
      <MetricRow label="Docs fetched" value={String(docs.length)} />
      <MetricRow label="Fields extracted" value={String(fields.length)} />
      <MetricRow label="Total bytes" value={formatBytes(totalBytes)} />
      <MetricRow label="Avg confidence" value={`${Math.round(avgConfidence * 100)}%`} />
      <MetricRow label="Queue jobs" value={String(data?.queue_jobs?.length ?? 0)} />
      <MetricRow label="Screenshots" value={String(data?.screenshots?.length ?? 0)} />
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="sf-text-subtle">{label}</span>
      <span className="font-mono sf-text-primary">{value}</span>
    </div>
  );
}
