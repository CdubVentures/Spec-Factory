import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { usePersistedNullableTab, usePersistedTab } from '../../../stores/tabStore';
import type { RuntimeOpsDocumentRow, RuntimeOpsDocumentDetailResponse } from '../types';
import { statusBadgeClass, formatBytes, truncateUrl, formatMs, getRefetchInterval, METRIC_TIPS } from '../helpers';
import { Tip } from '../../../components/common/Tip';
import { relativeTime } from '../../../utils/formatting';

interface DocumentsTabProps {
  documents: RuntimeOpsDocumentRow[];
  runId: string;
  category: string;
  isRunning: boolean;
}

const DOCUMENT_PAGE_SIZE_KEYS = ['25', '50', '100'] as const;
type DocumentPageSize = (typeof DOCUMENT_PAGE_SIZE_KEYS)[number];

export function DocumentsTab({ documents, runId, category, isRunning }: DocumentsTabProps) {
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
  const docUrlValues = useMemo(
    () => documents.map((document) => document.url),
    [documents],
  );
  const [selectedDocUrl, setSelectedDocUrl] = usePersistedNullableTab<string>(
    `runtimeOps:documents:selectedDoc:${category}`,
    null,
    { validValues: docUrlValues },
  );

  const filtered = useMemo(() => {
    if (!searchFilter) return documents.slice(0, pageSize);
    const lower = searchFilter.toLowerCase();
    return documents
      .filter((d) => d.url.toLowerCase().includes(lower) || d.host.toLowerCase().includes(lower) || d.status.toLowerCase().includes(lower))
      .slice(0, pageSize);
  }, [documents, searchFilter, pageSize]);

  const { data: docDetail } = useQuery({
    queryKey: ['runtime-ops', runId, 'document-detail', selectedDocUrl],
    queryFn: () => {
      const encoded = encodeURIComponent(selectedDocUrl!);
      return api.get<RuntimeOpsDocumentDetailResponse>(`/indexlab/run/${runId}/runtime/documents/${encoded}`);
    },
    enabled: Boolean(selectedDocUrl && runId),
    refetchInterval: getRefetchInterval(isRunning, !selectedDocUrl, 3000, 15000),
  });

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            placeholder="Filter by URL, host, status..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="flex-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
          />
          <select
            value={pageSizeValue}
            onChange={(e) => setPageSizeValue(e.target.value as DocumentPageSize)}
            className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <span className="text-xs text-gray-400 dark:text-gray-500">{filtered.length}/{documents.length}</span>
        </div>

        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">URL<Tip text={METRIC_TIPS.doc_url} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Host<Tip text={METRIC_TIPS.doc_host} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Status<Tip text={METRIC_TIPS.doc_status} /></th>
              <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Code<Tip text={METRIC_TIPS.doc_code} /></th>
              <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Size<Tip text={METRIC_TIPS.doc_size} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Hash<Tip text={METRIC_TIPS.doc_hash} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Dedupe<Tip text={METRIC_TIPS.doc_dedupe} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Parse<Tip text={METRIC_TIPS.doc_parse} /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr
                key={d.url}
                onClick={() => setSelectedDocUrl(selectedDocUrl === d.url ? null : d.url)}
                className={`cursor-pointer border-b border-gray-100 dark:border-gray-700/50 transition-colors ${
                  selectedDocUrl === d.url
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400 max-w-xs truncate">
                  {truncateUrl(d.url, 50)}
                </td>
                <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400">{d.host}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded ${statusBadgeClass(d.status)}`}>{d.status}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono">{d.status_code ?? '-'}</td>
                <td className="px-3 py-2 text-right font-mono">{formatBytes(d.bytes)}</td>
                <td className="px-3 py-2 font-mono text-gray-400">{d.content_hash || '-'}</td>
                <td className="px-3 py-2">{d.dedupe_outcome || '-'}</td>
                <td className="px-3 py-2">{d.parse_method || '-'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                  No documents found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedDocUrl && docDetail && (
        <div className="w-80 shrink-0 border-l border-gray-200 dark:border-gray-700 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Document Lifecycle
          </h3>
          <div className="mb-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">URL</div>
            <div className="text-xs font-mono text-gray-800 dark:text-gray-200 break-all">{docDetail.url}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Status</span>
              <div className="font-mono">{docDetail.status_code ?? '-'}</div>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Size</span>
              <div className="font-mono">{formatBytes(docDetail.bytes)}</div>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Parse</span>
              <div className="font-mono">{docDetail.parse_method || '-'}</div>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Candidates</span>
              <div className="font-mono">{docDetail.candidates ?? '-'}</div>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Evidence</span>
              <div className="font-mono">{docDetail.evidence_chunks ?? '-'}</div>
            </div>
          </div>

          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Timeline
          </h4>
          <div className="space-y-2">
            {docDetail.timeline.map((entry, i) => (
              <div
                key={`${entry.event}-${i}`}
                className="flex items-start gap-2 text-xs"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 dark:bg-blue-500 mt-1.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`px-1 py-0.5 rounded ${statusBadgeClass(entry.status)}`}>
                      {entry.stage} / {entry.status}
                    </span>
                    {entry.duration_ms != null && (
                      <span className="text-gray-400 font-mono">{formatMs(entry.duration_ms)}</span>
                    )}
                  </div>
                  <div className="text-gray-400 dark:text-gray-500 font-mono mt-0.5" title={entry.ts}>
                    {relativeTime(entry.ts)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
