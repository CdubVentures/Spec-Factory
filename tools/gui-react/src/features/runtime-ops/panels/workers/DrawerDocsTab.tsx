import { useMemo, useState } from 'react';
import type { RuntimeOpsDocumentRow, WorkerExtractionField, WorkerScreenshot, QueueJobRow } from '../../types';
import {
  formatBytes,
  truncateUrl,
  statusBadgeClass,
  methodBadgeClass,
  friendlyMethod,
} from '../../helpers';
import { DrawerDocDetailView } from './DrawerDocDetailView';

interface DrawerDocsTabProps {
  documents: RuntimeOpsDocumentRow[];
  extractionFields: WorkerExtractionField[];
  screenshots: WorkerScreenshot[];
  queueJobs: QueueJobRow[];
  runId: string;
  isRunning: boolean;
  category: string;
}

export type ContentTypeGroup = 'html' | 'pdf' | 'json' | 'other';

export function contentTypeGroup(ct: string | null): ContentTypeGroup {
  if (!ct) return 'other';
  const lower = ct.toLowerCase();
  if (lower.includes('html')) return 'html';
  if (lower.includes('pdf')) return 'pdf';
  if (lower.includes('json')) return 'json';
  return 'other';
}

export const CT_LABEL: Record<ContentTypeGroup, string> = { html: 'HTML', pdf: 'PDF', json: 'JSON', other: 'Other' };
export const CT_BADGE: Record<ContentTypeGroup, string> = { html: 'sf-chip-info', pdf: 'sf-chip-warning', json: 'sf-chip-success', other: 'sf-chip-neutral' };

export function dedupeBadgeClass(outcome: string | null): string {
  switch (outcome) {
    case 'duplicate': return 'sf-chip-warning';
    case 'skipped': return 'sf-chip-neutral';
    default: return 'sf-chip-success';
  }
}

export const STATUS_FLOW = ['discovered', 'fetching', 'fetched', 'parsed', 'indexed'] as const;

export function DrawerDocsTab({ documents, extractionFields, screenshots, queueJobs, runId, isRunning, category }: DrawerDocsTabProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDocUrl, setSelectedDocUrl] = useState<string | null>(null);

  const summary = useMemo(() => {
    const totalBytes = documents.reduce((s, d) => s + (d.bytes ?? 0), 0);
    const ctCounts: Record<ContentTypeGroup, number> = { html: 0, pdf: 0, json: 0, other: 0 };
    const statusCounts: Record<string, number> = {};
    for (const d of documents) {
      ctCounts[contentTypeGroup(d.content_type)] += 1;
      statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1;
    }
    return { totalBytes, ctCounts, statusCounts };
  }, [documents]);

  // Pre-compute per-document field counts for the table badges
  const docFieldCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of extractionFields) {
      counts[f.source_url] = (counts[f.source_url] ?? 0) + 1;
    }
    return counts;
  }, [extractionFields]);

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return documents.filter((d) => {
      if (searchLower && !d.url.toLowerCase().includes(searchLower) && !d.host.toLowerCase().includes(searchLower)) return false;
      if (typeFilter !== 'all' && contentTypeGroup(d.content_type) !== typeFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      return true;
    });
  }, [documents, search, typeFilter, statusFilter]);

  const selectedDoc = useMemo(
    () => selectedDocUrl ? documents.find((d) => d.url === selectedDocUrl) ?? null : null,
    [documents, selectedDocUrl],
  );

  if (selectedDoc) {
    return (
      <DrawerDocDetailView
        document={selectedDoc}
        extractionFields={extractionFields}
        screenshots={screenshots}
        queueJobs={queueJobs}
        runId={runId}
        isRunning={isRunning}
        category={category}
        onBack={() => setSelectedDocUrl(null)}
      />
    );
  }

  if (documents.length === 0) {
    return <div className="text-xs sf-text-subtle text-center py-4">No documents</div>;
  }

  const total = documents.length;
  const ctTotal = Object.values(summary.ctCounts).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="sf-surface-elevated p-2 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="sf-text-subtle">{total} docs</span>
          <span className="font-mono sf-text-primary">{formatBytes(summary.totalBytes)}</span>
        </div>
        {/* Content type distribution bar */}
        <div className="flex h-2 rounded-full overflow-hidden gap-px">
          {(['html', 'pdf', 'json', 'other'] as const).map((ct) => {
            const count = summary.ctCounts[ct];
            if (count === 0) return null;
            const pct = (count / ctTotal) * 100;
            return (
              <div
                key={ct}
                className={`${CT_BADGE[ct]} h-full`}
                style={{ width: `${pct}%` }}
                title={`${CT_LABEL[ct]}: ${count}`}
              />
            );
          })}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['html', 'pdf', 'json', 'other'] as const).map((ct) => {
            const count = summary.ctCounts[ct];
            if (count === 0) return null;
            return (
              <span key={ct} className={`px-1.5 py-0.5 rounded text-xs ${CT_BADGE[ct]}`}>
                {CT_LABEL[ct]} {count}
              </span>
            );
          })}
        </div>
        <div className="flex gap-1 flex-wrap">
          {Object.entries(summary.statusCounts).map(([status, count]) => (
            <span key={status} className={`px-1.5 py-0.5 rounded text-xs ${statusBadgeClass(status)}`}>
              {status} {count}
            </span>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-1.5 items-center">
        <input
          type="text"
          className="sf-input text-xs flex-1 px-2 py-1"
          placeholder="Search URL/host..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="sf-select text-xs px-1 py-1" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Type</option>
          <option value="html">HTML</option>
          <option value="pdf">PDF</option>
          <option value="json">JSON</option>
          <option value="other">Other</option>
        </select>
        <select className="sf-select text-xs px-1 py-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Status</option>
          {Object.keys(summary.statusCounts).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="sf-text-subtle text-xs whitespace-nowrap">{filtered.length}/{total}</span>
      </div>

      {/* Table */}
      <div className="sf-table-shell overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="sf-table-head">
              <th className="sf-table-head-cell text-left px-1.5 py-1">URL</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Status</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Type</th>
              <th className="sf-table-head-cell text-right px-1.5 py-1">Size</th>
              <th className="sf-table-head-cell text-right px-1.5 py-1">Fields</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const ctGroup = contentTypeGroup(d.content_type);
              const fieldCount = docFieldCounts[d.url] ?? 0;
              return (
                <tr
                  key={d.url}
                  className="sf-table-row cursor-pointer hover:sf-surface-elevated transition-colors"
                  onClick={() => setSelectedDocUrl(d.url)}
                  title={d.url}
                >
                  <td className="px-1.5 py-1 max-w-[10rem]">
                    <div className="font-mono sf-text-primary truncate">
                      {truncateUrl(d.url, 36)}
                    </div>
                    {d.parse_method && (
                      <span className={`px-1 py-0.5 rounded sf-text-caption ${methodBadgeClass(d.parse_method)}`}>{friendlyMethod(d.parse_method)}</span>
                    )}
                  </td>
                  <td className="px-1.5 py-1">
                    <span className={`px-1 py-0.5 rounded ${statusBadgeClass(d.status)}`}>{d.status}</span>
                  </td>
                  <td className="px-1.5 py-1">
                    <span className={`px-1 py-0.5 rounded ${CT_BADGE[ctGroup]}`}>{CT_LABEL[ctGroup]}</span>
                  </td>
                  <td className="px-1.5 py-1 text-right font-mono sf-text-muted">{formatBytes(d.bytes)}</td>
                  <td className="px-1.5 py-1 text-right">
                    {fieldCount > 0 ? (
                      <span className="sf-chip-success px-1 py-0.5 rounded font-mono">{fieldCount}</span>
                    ) : (
                      <span className="sf-text-muted">&ndash;</span>
                    )}
                  </td>
                  <td className="px-1.5 py-1 text-right">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sf-text-muted inline-block" aria-hidden="true">
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
