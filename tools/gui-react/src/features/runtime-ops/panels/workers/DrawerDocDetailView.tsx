import { useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client';
import { usePersistedTab } from '../../../../stores/tabStore';
import type {
  RuntimeOpsDocumentRow,
  RuntimeOpsDocumentDetailResponse,
  WorkerExtractionField,
  WorkerScreenshot,
  QueueJobRow,
  DocDetailSubTab,
} from '../../types';
import {
  formatBytes,
  truncateUrl,
  statusBadgeClass,
  methodBadgeClass,
  friendlyMethod,
  formatMs,
  getRefetchInterval,
  queueStatusBadgeClass,
} from '../../helpers';
import { relativeTime } from '../../../../utils/formatting';
import { ConfidenceBar } from '../../components/ConfidenceBar';
import { contentTypeGroup, CT_LABEL, CT_BADGE, dedupeBadgeClass, STATUS_FLOW } from './DrawerDocsTab';

interface DrawerDocDetailViewProps {
  document: RuntimeOpsDocumentRow;
  extractionFields: WorkerExtractionField[];
  screenshots: WorkerScreenshot[];
  queueJobs: QueueJobRow[];
  runId: string;
  isRunning: boolean;
  category: string;
  onBack: () => void;
}

const SUB_TABS: { key: DocDetailSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'fields', label: 'Fields' },
  { key: 'shots', label: 'Shots' },
  { key: 'timeline', label: 'Timeline' },
];

const DOC_DETAIL_SUB_TAB_KEYS = ['info', 'fields', 'shots', 'timeline'] as const satisfies ReadonlyArray<DocDetailSubTab>;

export function DrawerDocDetailView({
  document,
  extractionFields,
  screenshots,
  queueJobs,
  runId,
  isRunning,
  category,
  onBack,
}: DrawerDocDetailViewProps) {
  const [activeSubTab, setActiveSubTab] = usePersistedTab<DocDetailSubTab>(
    `runtimeOps:workers:docDetail:${category}`,
    'fields',
    { validValues: DOC_DETAIL_SUB_TAB_KEYS },
  );

  // ── Filtered data by document URL ──
  const docFields = useMemo(
    () => extractionFields.filter((f) => f.source_url === document.url),
    [extractionFields, document.url],
  );

  const docShots = useMemo(
    () => screenshots.filter((s) => s.url === document.url),
    [screenshots, document.url],
  );

  const docJobs = useMemo(
    () => queueJobs.filter((j) => j.url === document.url),
    [queueJobs, document.url],
  );

  // ── Timeline data (only fetched when timeline sub-tab is active) ──
  const { data: docDetail } = useQuery({
    queryKey: ['runtime-ops', runId, 'document-detail', document.url],
    queryFn: () => api.get<RuntimeOpsDocumentDetailResponse>(
      `/indexlab/run/${runId}/runtime/documents/${encodeURIComponent(document.url)}`,
    ),
    enabled: Boolean(runId && activeSubTab === 'timeline'),
    refetchInterval: getRefetchInterval(isRunning, activeSubTab !== 'timeline', 3000, 15000),
  });

  const ctGroup = contentTypeGroup(document.content_type);

  return (
    <div className="space-y-3">
      {/* Breadcrumb header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={onBack}
            className="sf-text-subtle hover:sf-text-primary transition-colors"
            aria-label="Back to documents list"
          >
            Docs
          </button>
          <span className="sf-text-muted">/</span>
          <span className="sf-text-primary font-medium truncate" title={document.url}>{document.host}</span>
        </div>
        <div className="font-mono text-xs sf-text-muted truncate" title={document.url}>
          {truncateUrl(document.url, 65)}
        </div>
        <div className="flex items-center gap-1">
          <span className={`px-1 py-0.5 rounded sf-text-caption ${statusBadgeClass(document.status)}`}>{document.status}</span>
          <span className={`px-1 py-0.5 rounded sf-text-caption ${CT_BADGE[ctGroup]}`}>{CT_LABEL[ctGroup]}</span>
          {document.parse_method && (
            <span className={`px-1 py-0.5 rounded sf-text-caption ${methodBadgeClass(document.parse_method)}`}>{friendlyMethod(document.parse_method)}</span>
          )}
          <span className="ml-auto font-mono sf-text-muted text-xs">{formatBytes(document.bytes)}</span>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveSubTab(t.key)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              activeSubTab === t.key ? 'sf-chip-info' : 'sf-text-subtle'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'info' && (
        <InfoSubTab
          document={document}
          ctGroup={ctGroup}
          docFields={docFields}
          docShots={docShots}
          docJobs={docJobs}
          onSwitchTab={setActiveSubTab}
        />
      )}
      {activeSubTab === 'fields' && <FieldsSubTab docFields={docFields} />}
      {activeSubTab === 'shots' && <ShotsSubTab docShots={docShots} runId={runId} />}
      {activeSubTab === 'timeline' && <TimelineSubTab docDetail={docDetail ?? null} />}
    </div>
  );
}

// ── Info Sub-Tab ──

function InfoSubTab({
  document,
  ctGroup,
  docFields,
  docShots,
  docJobs,
  onSwitchTab,
}: {
  document: RuntimeOpsDocumentRow;
  ctGroup: ReturnType<typeof contentTypeGroup>;
  docFields: WorkerExtractionField[];
  docShots: WorkerScreenshot[];
  docJobs: QueueJobRow[];
  onSwitchTab: (tab: DocDetailSubTab) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="sf-text-subtle">Status Code</span>
          <div className="font-mono">{document.status_code ?? '-'}</div>
        </div>
        <div>
          <span className="sf-text-subtle">Size</span>
          <div className="font-mono">{formatBytes(document.bytes)}</div>
        </div>
        <div>
          <span className="sf-text-subtle">Content Type</span>
          <div><span className={`px-1 py-0.5 rounded ${CT_BADGE[ctGroup]}`}>{CT_LABEL[ctGroup]}</span></div>
        </div>
        <div>
          <span className="sf-text-subtle">Parse Method</span>
          <div>
            {document.parse_method
              ? <span className={`px-1 py-0.5 rounded ${methodBadgeClass(document.parse_method)}`}>{friendlyMethod(document.parse_method)}</span>
              : '-'}
          </div>
        </div>
        <div>
          <span className="sf-text-subtle">Dedupe</span>
          <div>
            {document.dedupe_outcome
              ? <span className={`px-1 py-0.5 rounded ${dedupeBadgeClass(document.dedupe_outcome)}`}>{document.dedupe_outcome}</span>
              : '-'}
          </div>
        </div>
        <div>
          <span className="sf-text-subtle">Content Hash</span>
          <div className="font-mono sf-text-muted truncate" title={document.content_hash ?? undefined}>
            {document.content_hash ? document.content_hash.slice(0, 16) + '...' : '-'}
          </div>
        </div>
      </div>

      {/* Status flow dots */}
      <div className="flex items-center gap-1">
        {STATUS_FLOW.map((step) => {
          const idx = STATUS_FLOW.indexOf(document.status as typeof STATUS_FLOW[number]);
          const stepIdx = STATUS_FLOW.indexOf(step);
          const reached = stepIdx <= idx;
          return (
            <div key={step} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${reached ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className={`sf-text-caption ${reached ? 'sf-text-primary' : 'sf-text-muted'}`}>{step}</span>
            </div>
          );
        })}
      </div>

      {/* Relative timestamp */}
      <div className="text-xs sf-text-muted">{relativeTime(document.last_event_ts)}</div>

      {/* Counts strip */}
      <div className="flex gap-2 text-xs">
        <button type="button" className="sf-chip-info px-1.5 py-0.5 rounded" onClick={() => onSwitchTab('fields')}>
          {docFields.length} fields
        </button>
        <button type="button" className="sf-chip-info px-1.5 py-0.5 rounded" onClick={() => onSwitchTab('shots')}>
          {docShots.length} screenshots
        </button>
        <span className="sf-chip-neutral px-1.5 py-0.5 rounded">
          {docJobs.length} queue jobs
        </span>
      </div>

      {/* Queue jobs mini-table */}
      {docJobs.length > 0 && (
        <div className="sf-table-shell overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="sf-table-head">
                <th className="sf-table-head-cell text-left px-1.5 py-1">Lane</th>
                <th className="sf-table-head-cell text-left px-1.5 py-1">Status</th>
                <th className="sf-table-head-cell text-left px-1.5 py-1">Reason</th>
                <th className="sf-table-head-cell text-left px-1.5 py-1">Targets</th>
              </tr>
            </thead>
            <tbody>
              {docJobs.map((j) => (
                <tr key={j.id} className="sf-table-row">
                  <td className="px-1.5 py-1 font-mono">{j.lane}</td>
                  <td className="px-1.5 py-1">
                    <span className={`px-1 py-0.5 rounded ${queueStatusBadgeClass(j.status)}`}>{j.status}</span>
                  </td>
                  <td className="px-1.5 py-1 sf-text-muted max-w-[8rem] truncate" title={j.reason}>{j.reason}</td>
                  <td className="px-1.5 py-1">
                    <div className="flex gap-0.5 flex-wrap">
                      {j.field_targets.map((ft) => (
                        <span key={ft} className="sf-chip-neutral px-1 py-0.5 rounded sf-text-caption">{ft}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Fields Sub-Tab ──

function FieldsSubTab({ docFields }: { docFields: WorkerExtractionField[] }) {
  const [methodFilter, setMethodFilter] = useState<string | null>(null);

  const summary = useMemo(() => {
    const avgConfidence = docFields.length > 0
      ? docFields.reduce((s, f) => s + f.confidence, 0) / docFields.length
      : 0;
    const methodCounts: Record<string, number> = {};
    for (const f of docFields) {
      const m = f.method || 'unknown';
      methodCounts[m] = (methodCounts[m] ?? 0) + 1;
    }
    return { avgConfidence, methodCounts };
  }, [docFields]);

  const sorted = useMemo(() => {
    let list = [...docFields];
    if (methodFilter) {
      list = list.filter((f) => f.method === methodFilter);
    }
    list.sort((a, b) => b.confidence - a.confidence);
    return list;
  }, [docFields, methodFilter]);

  if (docFields.length === 0) {
    return <div className="text-xs sf-text-subtle text-center py-4">No fields extracted from this document</div>;
  }

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="sf-surface-elevated p-2 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="sf-text-subtle">{docFields.length} fields</span>
          <ConfidenceBar value={summary.avgConfidence} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {Object.entries(summary.methodCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([m, count]) => (
              <span key={m} className={`px-1.5 py-0.5 rounded text-xs ${methodBadgeClass(m)}`}>
                {friendlyMethod(m)} &times;{count}
              </span>
            ))}
        </div>
      </div>

      {/* Method chip filter */}
      <div className="flex gap-1 flex-wrap">
        <button
          type="button"
          className={`px-1.5 py-0.5 rounded text-xs transition-colors ${methodFilter === null ? 'sf-chip-info' : 'sf-text-subtle'}`}
          onClick={() => setMethodFilter(null)}
        >
          All
        </button>
        {Object.keys(summary.methodCounts).sort().map((m) => (
          <button
            key={m}
            type="button"
            className={`px-1.5 py-0.5 rounded text-xs transition-colors ${methodFilter === m ? 'sf-chip-info' : methodBadgeClass(m)}`}
            onClick={() => setMethodFilter(methodFilter === m ? null : m)}
          >
            {friendlyMethod(m)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="sf-table-shell overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="sf-table-head">
              <th className="sf-table-head-cell text-left px-1.5 py-1">Field</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Value</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Conf</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Method</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f, i) => (
              <tr key={`${f.field}-${i}`} className="sf-table-row">
                <td className="px-1.5 py-1 font-mono font-medium sf-text-primary whitespace-nowrap">{f.field}</td>
                <td className="px-1.5 py-1 font-mono sf-text-muted max-w-[8rem] truncate" title={f.value ?? undefined}>{f.value ?? '\u2013'}</td>
                <td className="px-1.5 py-1"><ConfidenceBar value={f.confidence} /></td>
                <td className="px-1.5 py-1">
                  <span className={`px-1 py-0.5 rounded ${methodBadgeClass(f.method)}`}>{friendlyMethod(f.method)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shots Sub-Tab ──

function ShotsSubTab({ docShots, runId }: { docShots: WorkerScreenshot[]; runId: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (lightboxIndex === null) return;
    if (e.key === 'Escape') setLightboxIndex(null);
    if (e.key === 'ArrowLeft') setLightboxIndex((i) => i !== null && i > 0 ? i - 1 : i);
    if (e.key === 'ArrowRight') setLightboxIndex((i) => i !== null && i < docShots.length - 1 ? i + 1 : i);
  }, [lightboxIndex, docShots.length]);

  useEffect(() => {
    if (lightboxIndex !== null) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [lightboxIndex, handleKeyDown]);

  if (docShots.length === 0) {
    return <div className="text-xs sf-text-subtle text-center py-4">No screenshots from this document</div>;
  }

  return (
    <div className="space-y-3">
      {/* 2-column thumbnail grid */}
      <div className="grid grid-cols-2 gap-2">
        {docShots.map((s, idx) => (
          <button
            key={s.filename}
            type="button"
            className="sf-surface-elevated overflow-hidden rounded text-left group"
            onClick={() => setLightboxIndex(idx)}
          >
            <div className="relative">
              <img
                src={`/api/v1/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(s.filename)}`}
                alt={s.filename}
                className="w-full rounded-t"
                loading="lazy"
              />
              <div className="absolute top-1 right-1 sf-chip-neutral px-1 py-0.5 rounded sf-text-caption opacity-80">
                {s.width}&times;{s.height} &middot; {formatBytes(s.bytes)}
              </div>
            </div>
            <div className="px-1.5 py-1 sf-text-caption sf-text-muted font-mono truncate">
              {relativeTime(s.ts)}
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox overlay */}
      {lightboxIndex !== null && docShots[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={() => setLightboxIndex(null)}
            aria-label="Close lightbox"
          />
          <div className="relative z-10 max-w-[90vw] max-h-[90vh]">
            <img
              src={`/api/v1/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(docShots[lightboxIndex].filename)}`}
              alt={docShots[lightboxIndex].filename}
              className="max-w-full max-h-[90vh] object-contain rounded"
            />
            <div className="absolute bottom-2 left-2 sf-chip-neutral px-2 py-1 rounded text-xs">
              {docShots[lightboxIndex].width}&times;{docShots[lightboxIndex].height} &middot; {formatBytes(docShots[lightboxIndex].bytes)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline Sub-Tab ──

function TimelineSubTab({ docDetail }: { docDetail: RuntimeOpsDocumentDetailResponse | null }) {
  if (!docDetail) {
    return <div className="text-xs sf-text-subtle text-center py-4">Loading timeline...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Top-level stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="sf-text-subtle">Candidates</span>
          <div className="font-mono">{docDetail.candidates ?? '-'}</div>
        </div>
        <div>
          <span className="sf-text-subtle">Evidence Chunks</span>
          <div className="font-mono">{docDetail.evidence_chunks ?? '-'}</div>
        </div>
      </div>

      {/* Timeline entries */}
      {docDetail.timeline.length === 0 ? (
        <div className="text-xs sf-text-subtle text-center py-4">Timeline not available</div>
      ) : (
        <div className="space-y-2">
          {docDetail.timeline.map((entry, i) => (
            <div
              key={`${entry.event}-${i}`}
              className="flex items-start gap-2 text-xs"
            >
              <div
                className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                style={{ background: 'rgb(var(--sf-color-accent-rgb))' }}
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className={`px-1 py-0.5 rounded ${statusBadgeClass(entry.status)}`}>
                    {entry.stage} / {entry.status}
                  </span>
                  {entry.duration_ms != null && (
                    <span className="sf-text-subtle font-mono">{formatMs(entry.duration_ms)}</span>
                  )}
                </div>
                <div className="sf-text-subtle font-mono mt-0.5" title={entry.ts}>
                  {relativeTime(entry.ts)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
