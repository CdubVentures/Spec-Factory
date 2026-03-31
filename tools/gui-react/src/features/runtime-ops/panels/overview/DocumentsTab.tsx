import { Fragment, useEffect, useMemo, useState } from 'react';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client.ts';
import { usePersistedExpandMap, usePersistedTab } from '../../../../stores/tabStore.ts';
import type {
  RuntimeOpsDocumentRow,
  RuntimeOpsDocumentDetailResponse,
  ExtractionPhasesResponse,
  ExtractionPluginEntry,
} from '../../types.ts';
import { statusBadgeClass, formatBytes, truncateUrl, formatMs, getRefetchInterval, METRIC_TIPS } from '../../helpers.ts';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { relativeTime } from '../../../../utils/formatting.ts';

/* ── Props ────────────────────────────────────────────────────── */

interface DocumentsTabProps {
  documents: RuntimeOpsDocumentRow[];
  runId: string;
  category: string;
  isRunning: boolean;
}

/* ── Helpers ──────────────────────────────────────────────────── */

const DOCUMENT_PAGE_SIZE_KEYS = ['25', '50', '100'] as const;
type DocumentPageSize = (typeof DOCUMENT_PAGE_SIZE_KEYS)[number];

function shortContentType(raw: string | null): string {
  if (!raw) return '-';
  const lower = raw.toLowerCase();
  if (lower.includes('html')) return 'HTML';
  if (lower.includes('pdf')) return 'PDF';
  if (lower.includes('json')) return 'JSON';
  if (lower.includes('xml')) return 'XML';
  if (lower.includes('text/plain')) return 'Text';
  if (lower.includes('csv')) return 'CSV';
  if (lower.includes('image')) return 'Image';
  return raw.split('/').pop()?.split(';')[0] ?? raw;
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const COL_COUNT = 6;

/* ── Artifact row for a single plugin (O(1) — rendered dynamically) ── */

interface ArtifactEntry extends ExtractionPluginEntry {
  filenames?: string[];
  file_sizes?: number[];
  total_bytes?: number;
  screenshot_count?: number;
  [key: string]: unknown;
}

function ArtifactRow({ pluginKey, entries, runId }: { pluginKey: string; entries: ArtifactEntry[]; runId: string }) {
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const allFilenames = useMemo(
    () => entries.flatMap((e) => e.filenames ?? []),
    [entries],
  );
  const totalBytes = entries.reduce((sum, e) => sum + (Number(e.total_bytes) || 0), 0);
  const isImage = pluginKey === 'screenshot' || pluginKey.includes('image');

  // WHY: Esc key closes the preview popup.
  useEffect(() => {
    if (!previewFile) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewFile(null); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [previewFile]);

  return (
    <>
      <div className="flex items-center gap-3 py-1.5">
        <span className="text-[10px] font-semibold sf-text-muted w-[80px] shrink-0">{titleCase(pluginKey)}</span>
        <span className="text-[10px] font-mono sf-text-primary">
          {allFilenames.length} {allFilenames.length === 1 ? 'file' : 'files'}
        </span>
        {totalBytes > 0 && (
          <span className="text-[10px] font-mono sf-text-subtle">{formatBytes(totalBytes)}</span>
        )}
        {isImage && allFilenames.length > 0 && (
          <div className="flex gap-1.5">
            {allFilenames.slice(0, 4).map((fname) => (
              <button
                key={fname}
                type="button"
                onClick={() => setPreviewFile(fname)}
                className="h-10 w-14 rounded sf-border-soft border overflow-hidden sf-row-hoverable transition-colors"
              >
                <img
                  src={`/api/v1/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(fname)}`}
                  alt={fname}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
            {allFilenames.length > 4 && (
              <span className="text-[10px] sf-text-subtle self-center">+{allFilenames.length - 4}</span>
            )}
          </div>
        )}
        {!isImage && allFilenames.length > 0 && (
          <button
            type="button"
            onClick={() => setPreviewFile(allFilenames[0])}
            className="text-[10px] sf-link-accent font-semibold"
          >
            Preview
          </button>
        )}
      </div>

      {/* Preview popup — Esc or click backdrop to close */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setPreviewFile(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {isImage ? (
              <img
                src={`/api/v1/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(previewFile)}`}
                alt={previewFile}
                className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl"
              />
            ) : (
              <video
                src={`/api/v1/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(previewFile)}`}
                controls
                autoPlay
                className="max-w-full max-h-[85vh] rounded shadow-2xl"
              />
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-3 py-2 rounded-b flex items-center justify-between">
              <span className="font-mono truncate">{previewFile}</span>
            </div>
            <button
              type="button"
              onClick={() => setPreviewFile(null)}
              className="absolute top-2 right-2 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 text-sm"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Expanded detail row ─────────────────────────────────────── */

function DocumentDetail({
  doc,
  detail,
  pluginEntries,
  runId,
}: {
  doc: RuntimeOpsDocumentRow;
  detail: RuntimeOpsDocumentDetailResponse | undefined;
  pluginEntries: Record<string, ArtifactEntry[]>;
  runId: string;
}) {
  const hasArtifacts = Object.keys(pluginEntries).length > 0;

  return (
    <div className="p-4 sf-surface-shell border-t sf-border-soft">
      <div className="flex gap-6">
        {/* Left: Stats */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-2">
            Details
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs mb-3">
            <div>
              <span className="sf-text-subtle">Status</span>
              <div className="font-mono">{detail?.status_code ?? doc.status_code ?? '-'}</div>
            </div>
            <div>
              <span className="sf-text-subtle">Size</span>
              <div className="font-mono">{formatBytes(detail?.bytes ?? doc.bytes)}</div>
            </div>
            <div>
              <span className="sf-text-subtle">Parse</span>
              <div className="font-mono">{detail?.parse_method ?? doc.parse_method ?? '-'}</div>
            </div>
            <div>
              <span className="sf-text-subtle">Candidates</span>
              <div className="font-mono">{detail?.candidates ?? '-'}</div>
            </div>
            <div>
              <span className="sf-text-subtle">Evidence</span>
              <div className="font-mono">{detail?.evidence_chunks ?? '-'}</div>
            </div>
            <div>
              <span className="sf-text-subtle">Hash</span>
              <div className="font-mono sf-text-muted">{doc.content_hash || '-'}</div>
            </div>
          </div>

          {/* Artifacts — O(1): dynamically iterates all plugin keys */}
          {hasArtifacts && (
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-1.5">
                Artifacts
              </div>
              {Object.entries(pluginEntries).map(([key, entries]) => (
                <ArtifactRow key={key} pluginKey={key} entries={entries} runId={runId} />
              ))}
            </div>
          )}
        </div>

        {/* Right: Timeline */}
        {detail && detail.timeline.length > 0 && (
          <div className="w-[240px] shrink-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-2">
              Timeline
            </div>
            <div className="space-y-1.5">
              {detail.timeline.map((entry, i) => (
                <div key={`${entry.event}-${i}`} className="flex items-start gap-2 text-xs">
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ background: 'rgb(var(--sf-color-accent-rgb))' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`px-1 py-0.5 rounded text-[10px] ${statusBadgeClass(entry.status)}`}>
                        {entry.stage}/{entry.status}
                      </span>
                      {entry.duration_ms != null && (
                        <span className="sf-text-subtle font-mono text-[10px]">{formatMs(entry.duration_ms)}</span>
                      )}
                    </div>
                    <div className="sf-text-subtle font-mono text-[10px] mt-0.5" title={entry.ts}>
                      {relativeTime(entry.ts)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────── */

export function DocumentsTab({ documents, runId, category, isRunning }: DocumentsTabProps) {
  const scrollRef = usePersistedScroll(`scroll:documents:${category}`);
  const [searchFilter, setSearchFilter] = usePersistedTab<string>(
    `runtimeOps:documents:search:${category}`,
    '',
  );
  const [pageSizeValue, setPageSizeValue] = usePersistedTab<DocumentPageSize>(
    `runtimeOps:documents:pageSize:${category}`,
    '50',
    { validValues: DOCUMENT_PAGE_SIZE_KEYS },
  );
  const pageSize = Number(pageSizeValue);

  const [expandedUrls, toggleExpanded] = usePersistedExpandMap(
    `runtimeOps:documents:expanded:${category}`,
  );
  const expandedUrl = useMemo(
    () => Object.keys(expandedUrls).find((k) => expandedUrls[k]) ?? null,
    [expandedUrls],
  );

  const filtered = useMemo(() => {
    if (!searchFilter) return documents.slice(0, pageSize);
    const lower = searchFilter.toLowerCase();
    return documents
      .filter((d) => d.url.toLowerCase().includes(lower) || d.host.toLowerCase().includes(lower) || d.status.toLowerCase().includes(lower))
      .slice(0, pageSize);
  }, [documents, searchFilter, pageSize]);

  // WHY: Fetch detail for expanded URL (same endpoint as old sidebar).
  const { data: docDetail } = useQuery({
    queryKey: ['runtime-ops', runId, 'document-detail', expandedUrl],
    queryFn: () => {
      const encoded = encodeURIComponent(expandedUrl!);
      return api.get<RuntimeOpsDocumentDetailResponse>(`/indexlab/run/${runId}/runtime/documents/${encoded}`);
    },
    enabled: Boolean(expandedUrl && runId),
    refetchInterval: getRefetchInterval(isRunning, !expandedUrl, 3000, 15000),
  });

  // WHY: Extraction plugin data — O(1) auto-discovers new plugins.
  // Shared queryKey with WorkersTab for TanStack Query deduplication.
  const { data: extractionResp } = useQuery({
    queryKey: ['runtime-ops', runId, 'extraction-plugins'],
    queryFn: () => api.get<ExtractionPhasesResponse>(`/indexlab/run/${runId}/runtime/extraction/plugins`),
    enabled: Boolean(runId),
    refetchInterval: getRefetchInterval(isRunning, false, 5000, 15000),
  });

  // WHY: Pre-index extraction entries by URL for O(1) lookup during render.
  const artifactsByUrl = useMemo(() => {
    const plugins = extractionResp?.plugins ?? {};
    const map = new Map<string, Record<string, ArtifactEntry[]>>();
    for (const [pluginKey, pluginData] of Object.entries(plugins)) {
      for (const entry of pluginData.entries) {
        if (!map.has(entry.url)) map.set(entry.url, {});
        const urlMap = map.get(entry.url)!;
        if (!urlMap[pluginKey]) urlMap[pluginKey] = [];
        urlMap[pluginKey].push(entry as ArtifactEntry);
      }
    }
    return map;
  }, [extractionResp]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-2 flex items-center gap-2 border-b sf-border-soft shrink-0">
        <input
          type="text"
          placeholder="Filter by URL, host, status..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="flex-1 text-xs px-2 py-1 sf-input"
        />
        <select
          value={pageSizeValue}
          onChange={(e) => setPageSizeValue(e.target.value as DocumentPageSize)}
          className="text-xs px-2 py-1 sf-select"
        >
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
        <span className="text-xs sf-text-subtle whitespace-nowrap">{filtered.length}/{documents.length}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sf-table-head sticky top-0 z-10">
            <tr>
              <th className="sf-table-head-cell text-left px-3 py-2 whitespace-nowrap">URL<Tip text={METRIC_TIPS.doc_url} /></th>
              <th className="sf-table-head-cell text-left px-3 py-2 whitespace-nowrap">Status<Tip text={METRIC_TIPS.doc_status} /></th>
              <th className="sf-table-head-cell text-right px-3 py-2 whitespace-nowrap">Code<Tip text={METRIC_TIPS.doc_code} /></th>
              <th className="sf-table-head-cell text-left px-3 py-2 whitespace-nowrap">Type</th>
              <th className="sf-table-head-cell text-left px-3 py-2 whitespace-nowrap">Parse<Tip text={METRIC_TIPS.doc_parse} /></th>
              <th className="sf-table-head-cell text-right px-3 py-2 whitespace-nowrap">Size<Tip text={METRIC_TIPS.doc_size} /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const isExpanded = expandedUrls[d.url] ?? false;
              return (
                <Fragment key={d.url}>
                  <tr
                    onClick={() => toggleExpanded(d.url)}
                    className={`cursor-pointer sf-table-row ${isExpanded ? 'sf-table-row-active' : ''}`}
                  >
                    <td className="px-3 py-2 font-mono sf-text-primary max-w-xs truncate whitespace-nowrap" title={d.url}>
                      <span className={`inline-block w-3 text-[10px] sf-text-subtle transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                        &#9654;
                      </span>
                      {truncateUrl(d.url, 50)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusBadgeClass(d.status)}`}>{d.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{d.status_code ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap sf-text-muted">{shortContentType(d.content_type)}</td>
                    <td className="px-3 py-2 whitespace-nowrap sf-text-muted">{d.parse_method || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatBytes(d.bytes)}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={COL_COUNT} className="p-0">
                        <DocumentDetail
                          doc={d}
                          detail={expandedUrl === d.url ? docDetail : undefined}
                          pluginEntries={artifactsByUrl.get(d.url) ?? {}}
                          runId={runId}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="px-3 py-8 text-center sf-text-subtle">
                  No documents found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
