import { SkeletonBlock } from '../../shared/ui/feedback/SkeletonBlock.tsx';

interface OverviewPageSkeletonProps {
  readonly category: string;
}

interface OverviewSkeletonColumn {
  readonly id: string;
  readonly width: string;
}

const OVERVIEW_TABLE_COLUMNS: readonly OverviewSkeletonColumn[] = [
  { id: 'select', width: 'w-[48px]' },
  { id: 'brand', width: 'w-[120px]' },
  { id: 'base_model', width: 'w-[170px]' },
  { id: 'variant', width: 'w-[170px]' },
  { id: 'family', width: 'w-[50px]' },
  { id: 'cef', width: 'w-[110px]' },
  { id: 'pif', width: 'w-[414px]' },
  { id: 'rdf', width: 'w-[376px]' },
  { id: 'sku', width: 'w-[376px]' },
  { id: 'key', width: 'w-[280px]' },
  { id: 'score', width: 'w-[70px]' },
  { id: 'coverage', width: 'w-[95px]' },
  { id: 'confidence', width: 'w-[95px]' },
  { id: 'fields', width: 'w-[95px]' },
  { id: 'live', width: 'w-[90px]' },
  { id: 'lastRun', width: 'w-[112px]' },
];
const OVERVIEW_TABLE_ROWS = Array.from({ length: 8 }, (_value, index) => `row-${index}`);
const OVERVIEW_METRICS = ['Products', 'Avg Confidence', 'Keys Resolved'] as const;
const OVERVIEW_COMMAND_MODULES = ['cef', 'pif', 'rdf', 'sku', 'kf'] as const;

function MetricSkeleton({ label }: { readonly label: string }) {
  return (
    <div className="sf-surface-card rounded-lg p-4 shadow-sm" data-region="overview-loading-metric">
      <p className="text-xs sf-status-text-muted uppercase tracking-wide">{label}</p>
      <div className="mt-1">
        <SkeletonBlock className="sf-skel-title" />
      </div>
    </div>
  );
}

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3" data-region="overview-loading-metrics">
      {OVERVIEW_METRICS.map((metric) => (
        <MetricSkeleton key={metric} label={metric} />
      ))}
    </div>
  );
}

function CommandConsoleSkeleton() {
  return (
    <aside className="sf-cc-panel" data-region="overview-loading-command-console" aria-label="Loading command console">
      <div className="sf-cc-row-header">
        <span className="sf-cc-selection-group">
          <span className="sf-cc-selection-badge is-empty">
            <span className="sf-cc-selection-count">0</span>
          </span>
          <button type="button" className="sf-cc-btn sf-cc-btn-clear" disabled>Clear</button>
        </span>
        <span className="sf-cc-smart">
          <span className="sf-cc-eyebrow">Smart</span>
          <button type="button" className="sf-cc-btn sf-cc-btn-secondary" disabled>
            <SkeletonBlock className="sf-skel-bar" />
          </button>
          <button type="button" className="sf-cc-btn sf-cc-btn-secondary" disabled>
            <SkeletonBlock className="sf-skel-bar" />
          </button>
        </span>
      </div>
      <div className="sf-cc-chips-row">
        {OVERVIEW_COMMAND_MODULES.map((moduleKey) => (
          <span key={moduleKey} className={`sf-cc-chip sf-cc-chip-${moduleKey}`}>
            <span className="sf-cc-chip-head">
              <SkeletonBlock className="sf-skel-icon-action" />
              <span className="sf-cc-chip-label">
                <SkeletonBlock className="sf-skel-caption" />
              </span>
            </span>
            <span className="sf-cc-chip-actions">
              <button type="button" className="sf-cc-btn sf-cc-btn-secondary" disabled>
                <SkeletonBlock className="sf-skel-bar" />
              </button>
            </span>
          </span>
        ))}
      </div>
      <div className="sf-cc-models-row">
        <span className="sf-cc-eyebrow">Models</span>
        <div className="sf-cc-models-track" role="group" aria-label="Loading configured models per finder">
          <span className="sf-cc-models-strip">
            {OVERVIEW_COMMAND_MODULES.map((moduleKey) => (
              <SkeletonBlock key={moduleKey} className="sf-skel-caption" />
            ))}
          </span>
        </div>
      </div>
      <div className="sf-cc-pipeline-row">
        <span className="sf-cc-eyebrow">Pipeline</span>
        <div className="sf-cc-pipeline-mid">
          <div className="sf-cc-stepper" role="group" aria-label="Loading pipeline stage progress">
            {['discover', 'fetch', 'parse', 'review'].map((stage) => (
              <span key={stage} className="sf-cc-stepper-seg sf-cc-stepper-seg-pending">
                <span className="sf-cc-stepper-bar">
                  <span className="sf-cc-stepper-bar-fill" />
                  <span className="sf-cc-stepper-label">&nbsp;</span>
                </span>
              </span>
            ))}
          </div>
        </div>
        <span className="sf-cc-pipeline-controls">
          <button type="button" className="sf-cc-btn sf-cc-btn-primary" disabled>
            <SkeletonBlock className="sf-skel-bar" />
          </button>
        </span>
      </div>
    </aside>
  );
}

function ActiveRowSkeleton() {
  return (
    <div
      className="sf-aas-row"
      data-region="overview-loading-active-row"
      role="region"
      aria-label="Loading active and selected products"
    >
      <div className="sf-aas-group sf-aas-group-active">
        <div className="sf-aas-eyebrow">
          <span className="sf-aas-count sf-aas-count-active">
            <SkeletonBlock className="sf-skel-bar" />
          </span>
          <span className="sf-aas-eyebrow-label">active</span>
        </div>
        <div className="sf-aas-track">
          <span className="sf-aas-badge sf-aas-badge-active">
            <span className="sf-aas-text">
              <SkeletonBlock className="sf-skel-caption" />
              <SkeletonBlock className="sf-skel-bar" />
            </span>
          </span>
        </div>
      </div>
      <div className="sf-aas-group sf-aas-group-idle">
        <div className="sf-aas-eyebrow">
          <span className="sf-aas-count sf-aas-count-idle">
            <SkeletonBlock className="sf-skel-bar" />
          </span>
          <span className="sf-aas-eyebrow-label">selected</span>
        </div>
        <div className="sf-aas-track">
          <span className="sf-aas-badge sf-aas-badge-idle">
            <span className="sf-aas-text">
              <SkeletonBlock className="sf-skel-caption" />
              <SkeletonBlock className="sf-skel-bar" />
            </span>
          </span>
        </div>
        <button type="button" className="sf-aas-clear" disabled>Clear</button>
      </div>
    </div>
  );
}

function FilterRowSkeleton() {
  return (
    <div
      className="sf-surface-alt border sf-border-soft rounded-lg shadow-sm px-3 py-2 flex items-center gap-3 flex-wrap"
      data-region="overview-loading-filter-row"
    >
      <div className="relative inline-flex items-center flex-[0_1_340px] min-w-[200px]">
        <span className="absolute left-2.5 w-3.5 h-3.5 sf-text-muted pointer-events-none" aria-hidden />
        <div className="sf-input w-full pl-8 pr-8 py-1.5 text-[12.5px]">
          <SkeletonBlock className="sf-skel-bar" />
        </div>
        <span
          aria-hidden
          className="absolute right-2 sf-surface-alt sf-text-muted font-mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded border sf-border-soft leading-none"
        >
          /
        </span>
      </div>
      <div className="ml-auto">
        <span className="inline-flex items-center gap-2 text-[12.5px] sf-text-primary tabular-nums">
          <SkeletonBlock className="sf-skel-caption" />
          <span className="sf-text-muted text-[11.5px]">keys</span>
          <span className="relative inline-block w-[72px] h-[3px] rounded-full overflow-hidden sf-bg-surface-soft-strong" aria-hidden>
            <span className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-200 sf-bg-accent" />
          </span>
        </span>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div
      className="sf-table-shell sf-primitive-table-shell overflow-auto max-h-[calc(100vh-340px)]"
      data-region="overview-loading-table"
    >
      <table className="min-w-full text-sm table-fixed" aria-hidden="true">
        <colgroup>
          {OVERVIEW_TABLE_COLUMNS.map((column) => (
            <col key={column.id} className={column.width} />
          ))}
        </colgroup>
        <thead className="sf-table-head sticky top-0">
          <tr>
            {OVERVIEW_TABLE_COLUMNS.map((column) => (
              <th
                key={column.id}
                className="sf-table-head-cell cursor-pointer select-none"
                data-skeleton-column={column.id}
              >
                <div className="flex items-center gap-1">
                  <SkeletonBlock className="sf-skel-bar" />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sf-border-default">
          {OVERVIEW_TABLE_ROWS.map((row) => (
            <tr key={row} className="sf-table-row" data-skeleton-row={row}>
              {OVERVIEW_TABLE_COLUMNS.map((column) => (
                <td key={`${row}-${column.id}`} className="px-2 py-1.5" data-skeleton-cell={column.id}>
                  <SkeletonBlock className="sf-skel-bar" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OverviewPageSkeleton({ category }: OverviewPageSkeletonProps) {
  return (
    <div
      className="space-y-6 sf-text-primary"
      data-testid="overview-loading-skeleton"
      aria-busy="true"
    >
      <span className="sr-only">Loading overview for {category}</span>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        <MetricsSkeleton />
        <CommandConsoleSkeleton />
      </div>
      <ActiveRowSkeleton />
      <FilterRowSkeleton />
      <TableSkeleton />
    </div>
  );
}
