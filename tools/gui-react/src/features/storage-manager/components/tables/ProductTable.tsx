import { useMemo, Fragment, useState } from 'react';
import { Chip } from '@/shared/ui/feedback/Chip';
import { Spinner } from '@/shared/ui/feedback/Spinner';
import { AlertBanner } from '@/shared/ui/feedback/AlertBanner';
import type { ProductGroup } from '../../helpers.ts';
import type { RunInventoryRow, RunSourceEntry } from '../../types.ts';
import { formatBytes, formatDuration, formatRelativeDate, runSizeBytes } from '../../helpers.ts';
import { useRunDetail } from '../../state/useRunDetail.ts';
import { usePersistedTab, usePersistedExpandMap } from '../../../../stores/tabStore.ts';
import { StorageProductTableSkeleton } from '../StorageLoadingSkeleton.tsx';

/* ── Constants ────────────────────────────────────────────────── */

const STATUS_CLS: Record<string, string> = {
  completed: 'sf-chip-success',
  failed: 'sf-chip-danger',
  running: 'sf-chip-warning',
};

const RUN_SOURCE_PAGE_SIZE = 100;

/* ── Artifact rows ────────────────────────────────────────────── */

function ArtifactRows({ source }: { source: RunSourceEntry }) {
  const artifacts: Array<{ label: string; file: string; size?: number }> = [];
  if (source.html_file) artifacts.push({ label: 'HTML', file: source.html_file, size: source.html_size });
  if (source.video_file) artifacts.push({ label: 'Video', file: source.video_file, size: source.video_size });
  if (source.screenshot_count > 0) artifacts.push({ label: 'Screenshots', file: `${source.screenshot_count} capture(s)`, size: source.screenshot_size });
  if (artifacts.length === 0) return null;

  return (
    <>
      {artifacts.map((a) => (
        <tr key={a.label} className="border-b border-dotted sf-border-soft">
          <td />
          <td className="px-2 py-0.5 overflow-hidden">
            <div className="flex items-center gap-3 text-[10px]" style={{ paddingLeft: 56 }}>
              <span className="border-l border-dotted sf-border-soft h-3 shrink-0" />
              <span className="sf-text-muted w-[56px] shrink-0">{a.label}</span>
              <span className="font-mono sf-text-subtle truncate">{a.file}</span>
            </div>
          </td>
          <td />
          <td className="px-4 py-0.5 text-right font-mono text-[10px] sf-text-muted">{a.size != null && a.size > 0 ? formatBytes(a.size) : ''}</td>
          <td />
        </tr>
      ))}
    </>
  );
}

/* ── URL Sources (lazy-loaded per run) ────────────────────────── */

interface SourceRowsProps {
  runId: string;
  productId: string;
  category: string;
  onDeleteUrl?: (url: string, productId: string, category: string) => void;
  isDeletingUrl?: boolean;
}

function SourceRows({ runId, productId, category, onDeleteUrl, isDeletingUrl }: SourceRowsProps) {
  const [sourcesLimit, setSourcesLimit] = useState(RUN_SOURCE_PAGE_SIZE);
  const { data: detail, isLoading, isFetching, error } = useRunDetail(runId, {
    sourcesLimit,
    sourcesOffset: 0,
  });
  const sources: RunSourceEntry[] = detail?.sources ?? [];
  const sourcesPage = detail?.sources_page ?? null;
  const totalSources = Number(sourcesPage?.total ?? sources.length);
  const loadedSourceCount = Number(sourcesPage?.offset ?? 0) + sources.length;
  const remainingSources = Math.max(0, totalSources - loadedSourceCount);
  const hasMoreSources = Boolean(sourcesPage?.has_more) || remainingSources > 0;
  const nextSourceCount = Math.max(1, Math.min(RUN_SOURCE_PAGE_SIZE, remainingSources || RUN_SOURCE_PAGE_SIZE));
  const [expandedUrls, toggleUrl] = usePersistedExpandMap(`storage:urls:${runId}`);

  if (isLoading) {
    return (
      <tr><td colSpan={5} className="py-2" style={{ paddingLeft: 40 }}>
        <span className="flex items-center gap-2"><Spinner className="h-3 w-3" /><span className="text-xs sf-text-muted">Loading sources...</span></span>
      </td></tr>
    );
  }
  if (error) {
    return <tr><td colSpan={5} className="py-2" style={{ paddingLeft: 40 }}><AlertBanner severity="warning" title="Failed to load" message={String(error)} /></td></tr>;
  }
  if (sources.length === 0) {
    return <tr><td colSpan={5} className="py-2 text-xs sf-text-subtle" style={{ paddingLeft: 40 }}>No source URLs</td></tr>;
  }

  return (
    <>
      {sources.map((s) => {
        const hasArtifacts = Boolean(s.html_file || s.video_file || s.screenshot_count > 0);
        const isOpen = expandedUrls[s.url] ?? false;
        const statusCls = s.blocked ? 'sf-status-text-warning' : s.status >= 200 && s.status < 400 ? 'sf-status-text-success' : 'sf-status-text-danger';
        return (
          <Fragment key={s.url}>
            <tr
              className={`border-b sf-border-soft ${hasArtifacts ? 'sf-row-hoverable cursor-pointer' : 'opacity-70'}`}
              onClick={hasArtifacts ? () => toggleUrl(s.url) : undefined}
            >
              <td className="px-2 py-1 text-center">
                {hasArtifacts && <span className={`text-[10px] sf-text-subtle inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9654;</span>}
              </td>
              <td className="px-2 py-1 overflow-hidden">
                <div className="flex items-center gap-2" style={{ paddingLeft: 32 }}>
                  <span className="border-l sf-border-soft h-4 shrink-0" />
                  <span className={`font-mono text-[10px] shrink-0 ${statusCls}`}>{s.status}</span>
                  <span className="font-mono text-[11px] sf-text-primary truncate" title={s.url}>{s.url}</span>
                </div>
              </td>
              <td className="px-4 py-1 text-right font-mono text-[10px] sf-text-muted">{s.content_hash?.slice(0, 8) || '\u2014'}</td>
              <td className="px-4 py-1 text-right font-mono text-[10px] sf-text-muted">{s.total_size != null && s.total_size > 0 ? formatBytes(s.total_size) : ''}</td>
              <td className="px-2 py-1 text-right">
                {onDeleteUrl && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDeleteUrl(s.url, productId, category); }}
                    disabled={isDeletingUrl}
                    className="text-[10px] font-semibold sf-status-text-danger hover:underline disabled:opacity-50"
                    title="Delete this URL and all its artifacts"
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
            {isOpen && <ArtifactRows source={s} />}
          </Fragment>
        );
      })}
      {hasMoreSources && (
        <tr>
          <td />
          <td colSpan={4} className="px-2 py-2">
            <div className="flex items-center justify-between gap-3 pl-8 text-[11px]">
              <span className="sf-text-muted">
                Showing {Math.min(loadedSourceCount, totalSources)} of {totalSources} sources
              </span>
              <button
                type="button"
                onClick={() => setSourcesLimit((current) => current + RUN_SOURCE_PAGE_SIZE)}
                disabled={isFetching}
                className="sf-secondary-button px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
              >
                Load {nextSourceCount} more source{nextSourceCount === 1 ? '' : 's'}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Run rows ─────────────────────────────────────────────────── */

interface RunRowsProps {
  runs: RunInventoryRow[];
  onDeleteRun: (id: string) => void;
  isDeleting: boolean;
  onDeleteUrl?: (url: string, productId: string, category: string) => void;
  isDeletingUrl?: boolean;
}

function RunRows({ runs, onDeleteRun, isDeleting, onDeleteUrl, isDeletingUrl }: RunRowsProps) {
  const [expandedRuns, toggleRun] = usePersistedExpandMap('storage:runs');

  return (
    <>
      {runs.map((run) => {
        const isOpen = expandedRuns[run.run_id] ?? false;
        return (
          <Fragment key={run.run_id}>
            <tr className="border-b sf-border-soft sf-row-hoverable cursor-pointer" onClick={() => toggleRun(run.run_id)}>
              <td className="px-2 py-1.5 text-center">
                <span className={`text-[10px] sf-text-subtle inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9654;</span>
              </td>
              <td className="px-2 py-1.5 overflow-hidden">
                <div className="flex items-center gap-2" style={{ paddingLeft: 8 }}>
                  <span className="border-l-2 border-[var(--sf-token-accent)] h-4 shrink-0" />
                  <span className="font-mono text-xs sf-text-primary truncate" title={run.run_id}>{run.run_id}</span>
                  <Chip label={run.status} className={STATUS_CLS[run.status] ?? 'sf-chip-neutral'} />
                  <span className="text-[10px] sf-text-muted shrink-0">{formatRelativeDate(run.started_at)}</span>
                  <span className="text-[10px] sf-text-muted shrink-0">{formatDuration(run.started_at, run.ended_at)}</span>
                </div>
              </td>
              <td />
              <td className="px-4 py-1.5 text-right font-mono text-xs sf-text-primary">{formatBytes(runSizeBytes(run))}</td>
              <td className="px-4 py-1.5 text-right">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeleteRun(run.run_id); }}
                  disabled={isDeleting}
                  className="text-[10px] font-semibold sf-status-text-danger hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </td>
            </tr>
            {isOpen && (
              <SourceRows
                runId={run.run_id}
                productId={run.product_id}
                category={run.category}
                onDeleteUrl={onDeleteUrl}
                isDeletingUrl={isDeletingUrl}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/* ── Main ProductTable ────────────────────────────────────────── */

interface ProductTableProps {
  products: ProductGroup[];
  isLoading: boolean;
  onDeleteAll: (runIds: string[]) => void;
  onDeleteRun: (runId: string) => void;
  isDeleting: boolean;
  onDeleteUrl?: (url: string, productId: string, category: string) => void;
  isDeletingUrl?: boolean;
  onPurgeHistory?: (productId: string, category: string) => void;
  isPurgingHistory?: boolean;
}

type SortField = 'product' | 'runs' | 'size';
type SortDir = 'asc' | 'desc';

export function ProductTable({ products, isLoading, onDeleteAll, onDeleteRun, isDeleting, onDeleteUrl, isDeletingUrl, onPurgeHistory, isPurgingHistory }: ProductTableProps) {
  const [filter, setFilter] = usePersistedTab<string>('storage:table:filter', '');
  const [brandFilter, setBrandFilter] = usePersistedTab<string>('storage:table:brandFilter', '');
  const [sortField, setSortField] = usePersistedTab<SortField>('storage:table:sortField', 'size');
  const [sortDir, setSortDir] = usePersistedTab<SortDir>('storage:table:sortDir', 'desc');
  const [expandedProducts, toggleProduct] = usePersistedExpandMap('storage:products');

  const brands = useMemo(
    () => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(),
    [products],
  );

  function handleSort(field: SortField) {
    if (field === sortField) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }
    else { setSortField(field); setSortDir(field === 'product' ? 'asc' : 'desc'); }
  }

  const displayed = useMemo(() => {
    let result = products;
    if (brandFilter) result = result.filter((p) => p.brand === brandFilter);
    if (filter) {
      const lower = filter.toLowerCase();
      result = result.filter((p) => p.key.toLowerCase().includes(lower));
    }
    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'product') cmp = a.key.localeCompare(b.key);
      else if (sortField === 'runs') cmp = a.runs.length - b.runs.length;
      else cmp = a.totalSize - b.totalSize;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [products, filter, brandFilter, sortField, sortDir]);

  function sortIndicator(field: SortField): string {
    return sortField === field ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
  }

  if (isLoading) {
    return <StorageProductTableSkeleton />;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-3 mb-2">
        <input
          type="text"
          placeholder="Search products..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="sf-input sf-primitive-input sf-table-search-input w-full max-w-xs"
        />
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="sf-input text-xs rounded px-3 py-1.5"
        >
          <option value="">All Brands</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div className="sf-table-shell sf-primitive-table-shell overflow-auto max-h-[calc(100vh-280px)]">
        <table className="min-w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead className="sf-table-head sticky top-0">
            <tr>
              <th className="sf-table-head-cell" />
              <th className="sf-table-head-cell cursor-pointer select-none" onClick={() => handleSort('product')}>
                <span className="flex items-center gap-1">Product{sortIndicator('product')}</span>
              </th>
              <th className="sf-table-head-cell text-right cursor-pointer select-none" onClick={() => handleSort('runs')}>
                Runs{sortIndicator('runs')}
              </th>
              <th className="sf-table-head-cell text-right cursor-pointer select-none" onClick={() => handleSort('size')}>
                Size{sortIndicator('size')}
              </th>
              <th className="sf-table-head-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sf-border-default">
            {displayed.map((product) => {
              const isOpen = expandedProducts[product.key] ?? false;
              return (
                <Fragment key={product.key}>
                  <tr className="sf-table-row sf-row-hoverable cursor-pointer" onClick={() => toggleProduct(product.key)}>
                    <td className="px-2 py-2 text-center">
                      <span className={`text-[10px] sf-text-subtle inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9654;</span>
                    </td>
                    <td className="px-2 py-2 overflow-hidden">
                      <span className="font-semibold sf-text-primary truncate block" title={product.key}>{product.key}</span>
                    </td>
                    <td className="px-4 py-2 text-right sf-text-muted">{product.runs.length}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold sf-text-primary">{formatBytes(product.totalSize)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onPurgeHistory && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onPurgeHistory(product.runs[0]?.product_id ?? '', product.runs[0]?.category ?? ''); }}
                            disabled={isPurgingHistory}
                            className="text-[10px] font-semibold sf-text-warning hover:underline disabled:opacity-50"
                            title="Purge all run history (keeps product identity)"
                          >
                            Purge History
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeleteAll(product.runs.map((r) => r.run_id)); }}
                          disabled={isDeleting}
                          className="text-[10px] font-semibold sf-status-text-danger hover:underline disabled:opacity-50"
                        >
                          Delete Runs
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <RunRows
                      runs={product.runs}
                      onDeleteRun={onDeleteRun}
                      isDeleting={isDeleting}
                      onDeleteUrl={onDeleteUrl}
                      isDeletingUrl={isDeletingUrl}
                    />
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {displayed.length === 0 && (
          <div className="sf-table-empty-state text-center py-8 text-sm">
            {filter || brandFilter ? 'No products match the current filters.' : 'No products found in storage.'}
          </div>
        )}
      </div>
    </div>
  );
}
