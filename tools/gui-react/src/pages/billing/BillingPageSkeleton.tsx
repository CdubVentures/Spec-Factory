import { useMemo } from 'react';

// WHY: Route-level skeleton for /billing. Self-contained — no cross-file
// imports — so the eager bundle stays lean (BillingPage's recharts +
// react-table deps stay in the lazy chunk). Mirrors the loaded BillingPage
// shape: hero band → action strip → filter bar → cost section (chart +
// donut + 2 horizontal-bar cards) → token section (chart + prompt cache +
// donut + 2 horizontal-bar cards) → 14-col entry table. Static labels
// (h1, h2, h3, eyebrow text, column titles) are copied verbatim from the
// loaded source; dynamic value bits shimmer at the real CSS font heights
// and slot dimensions.

interface SkeletonColumn {
  readonly id: string;
  readonly header: string;
  readonly size: number;
  readonly kind: 'dot' | 'text' | 'tag' | 'access' | 'composition';
}

const ENTRY_TABLE_COLUMNS: ReadonlyArray<SkeletonColumn> = [
  { id: 'status',                header: '',          size: 24,  kind: 'dot' },
  { id: 'ts',                    header: 'Timestamp', size: 150, kind: 'text' },
  { id: 'product_id',            header: 'Product',   size: 170, kind: 'text' },
  { id: 'reason',                header: 'Call Type', size: 120, kind: 'tag' },
  { id: 'model',                 header: 'Model',     size: 150, kind: 'text' },
  { id: 'access',                header: 'Access',    size: 65,  kind: 'access' },
  { id: 'sent_tokens',           header: 'Prompt',    size: 75,  kind: 'text' },
  { id: 'usage_tokens',          header: 'Usage',     size: 75,  kind: 'text' },
  { id: 'prompt_tokens',         header: 'Input',     size: 75,  kind: 'text' },
  { id: 'completion_tokens',     header: 'Output',    size: 90,  kind: 'text' },
  { id: 'cached_prompt_tokens',  header: 'Cached',    size: 75,  kind: 'text' },
  { id: 'tokmix',                header: 'Mix',       size: 80,  kind: 'composition' },
  { id: 'duration',              header: 'Time',      size: 65,  kind: 'text' },
  { id: 'cost_usd',              header: 'Cost',      size: 80,  kind: 'text' },
];

function CellSkel({ kind }: { readonly kind: SkeletonColumn['kind'] }) {
  if (kind === 'dot') return <span className="sf-shimmer inline-block w-2 h-2 rounded-full" aria-hidden="true" />;
  if (kind === 'tag') return <span className="sf-billing-tag sf-shimmer inline-block" aria-hidden="true">&nbsp;</span>;
  if (kind === 'access') return <span className="sf-access-tag sf-access-tag-api sf-shimmer inline-block" aria-hidden="true">&nbsp;</span>;
  if (kind === 'composition') return <span className="sf-tok-composition sf-shimmer" aria-hidden="true" />;
  return <span className="sf-shimmer block h-[11px] w-full rounded-sm" aria-hidden="true" />;
}

function HeroKpiSkel({ ico, label, hasTrend, hasSubline, hasSparkline }: {
  readonly ico: string;
  readonly label: string;
  readonly hasTrend?: boolean;
  readonly hasSubline?: boolean;
  readonly hasSparkline?: boolean;
}) {
  return (
    <div className="sf-hero-kpi" aria-hidden="true">
      <div className="sf-hero-kpi-label">
        <span className="sf-hero-kpi-ico">{ico}</span>
        {label}
      </div>
      <div className="sf-hero-kpi-value">
        <span className="sf-shimmer block h-[21px] w-full rounded-sm" />
      </div>
      <div className="sf-hero-kpi-sub">
        {hasTrend ? <span className="sf-hero-trend sf-hero-trend-flat sf-shimmer">&nbsp;</span> : null}
        {hasSubline ? <span className="sf-shimmer inline-block h-[11px] w-24 rounded-sm" /> : null}
      </div>
      {hasSparkline ? <span className="sf-shimmer sf-hero-sparkline rounded-sm block" /> : null}
    </div>
  );
}

function HeroBandSkel() {
  return (
    <section className="sf-hero-band">
      <div className="sf-hero-header">
        <div className="sf-hero-title-block">
          <div className="sf-hero-eyebrow">LLM Billing &amp; Usage</div>
          <h1 className="sf-hero-title">Cost &amp; Token Overview</h1>
          <p className="sf-hero-meta">
            <span className="sf-shimmer inline-block h-[13px] w-72 rounded-sm align-middle" aria-hidden="true" />
          </p>
        </div>
      </div>
      <div className="sf-hero-split">
        <div className="sf-hero-half sf-hero-cost">
          <div className="sf-hero-half-header">
            <span className="sf-hero-flame sf-hero-flame-cost" />
            <h2>Cost Overview</h2>
            <span className="sf-hero-half-meta">USD billed</span>
          </div>
          <div className="sf-hero-kpi-grid">
            <HeroKpiSkel ico="$" label="Total" hasTrend hasSparkline />
            <HeroKpiSkel ico="⚡" label="Calls" hasTrend hasSparkline />
            <HeroKpiSkel ico="⊘" label="Avg / Call" hasSparkline />
            <HeroKpiSkel ico="★" label="Top Type" hasSubline hasSparkline />
          </div>
        </div>
        <div className="sf-hero-divider" aria-hidden="true" />
        <div className="sf-hero-half sf-hero-tok">
          <div className="sf-hero-half-header">
            <span className="sf-hero-flame sf-hero-flame-tok" />
            <h2>Token Overview</h2>
            <span className="sf-hero-half-meta">billable units</span>
          </div>
          <div className="sf-hero-kpi-grid">
            <HeroKpiSkel ico="◐" label="Prompt" hasSubline hasSparkline />
            <HeroKpiSkel ico="◈" label="Usage" hasSubline />
            <HeroKpiSkel ico="#" label="Input" hasTrend hasSparkline />
            <HeroKpiSkel ico="◑" label="Output" hasTrend hasSparkline />
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionStripSkel() {
  return (
    <div className="sf-billing-action-strip">
      <div className="sf-billing-action-copy">
        <span className="sf-billing-action-eyebrow">View controls</span>
        <strong>Billing lens</strong>
        <span>Reset filters or inspect the live model cost catalog.</span>
      </div>
      <div className="sf-billing-action-buttons">
        <span className="sf-billing-clear-button sf-shimmer" aria-hidden="true">&nbsp;</span>
        <span className="sf-billing-cost-button sf-shimmer" aria-hidden="true">&nbsp;</span>
      </div>
    </div>
  );
}

function FilterRowSkel({ label, count }: { readonly label: string; readonly count: number }) {
  return (
    <div className="sf-filter-row">
      <span className="sf-filter-label">{label}</span>
      {Array.from({ length: count }, (_v, i) => (
        <span key={`${label}-${i}`} className="sf-filter-chip sf-shimmer" aria-hidden="true">&nbsp;</span>
      ))}
    </div>
  );
}

function FilterBarSkel() {
  return (
    <div className="sf-filter-bar">
      <FilterRowSkel label="Category" count={5} />
      <FilterRowSkel label="Call Type" count={8} />
      <FilterRowSkel label="Model" count={6} />
    </div>
  );
}

function SectionHeadingSkel({ label, meta, tok }: { readonly label: string; readonly meta?: string; readonly tok?: boolean }) {
  return (
    <div className={`sf-section-heading${tok ? ' is-tok' : ''}`}>
      <span className="sf-section-heading-bar" />
      <h2>{label}</h2>
      {meta ? <span className="sf-section-heading-meta">{meta}</span> : null}
    </div>
  );
}

function ChartCardSkel({ title, tokenStyle }: { readonly title: string; readonly tokenStyle?: boolean }) {
  return (
    <div className={`sf-surface-card rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart${tokenStyle ? ' sf-tok-themed' : ''}`}>
      <div className="px-5 py-3 flex items-center justify-between border-b sf-border-default">
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="p-5 flex-1 min-h-0">
        <span className="sf-shimmer sf-skel-chart block rounded" aria-hidden="true" />
      </div>
    </div>
  );
}

function DonutCardSkel({ title, tokenStyle }: { readonly title: string; readonly tokenStyle?: boolean }) {
  return (
    <div className={`sf-surface-card rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart${tokenStyle ? ' sf-tok-themed' : ''}`}>
      <div className="px-5 py-3 border-b sf-border-default">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="sf-shimmer block h-[12px] w-40 rounded-sm mt-0.5" aria-hidden="true" />
      </div>
      <div className="p-5 flex-1 flex flex-col items-center justify-center gap-3">
        <span className="sf-shimmer rounded-full block" style={{ width: 180, height: 180 }} aria-hidden="true" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full">
          {Array.from({ length: 4 }, (_v, i) => (
            <span key={`legend-${i}`} className="sf-shimmer block h-[12px] w-full rounded-sm" aria-hidden="true" />
          ))}
        </div>
      </div>
    </div>
  );
}

function PromptCachePanelSkel() {
  return (
    <div className="sf-surface-card sf-tok-themed rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart">
      <div className="px-5 py-3 border-b sf-border-default">
        <h3 className="text-sm font-bold">Prompt Cache</h3>
        <div className="text-[11px] sf-text-subtle mt-0.5">Hit rate &amp; savings</div>
      </div>
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="sf-cache-hero">
          <span className="sf-shimmer block h-12 w-32 rounded-sm" aria-hidden="true" />
          <div className="sf-cache-label">Hit Rate</div>
          <span className="sf-shimmer inline-block h-[12px] w-40 rounded-sm" aria-hidden="true" />
        </div>
        <div className="sf-cache-body">
          <div className="sf-cache-stat-row">
            <span className="sf-cache-stat-label">Cached reads</span>
            <span className="sf-shimmer inline-block h-[12px] w-16 rounded-sm" aria-hidden="true" />
          </div>
          <div className="sf-cache-stat-row">
            <span className="sf-cache-stat-label">Uncached input</span>
            <span className="sf-shimmer inline-block h-[12px] w-16 rounded-sm" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

function HorizontalBarSectionSkel({ title }: { readonly title: string }) {
  return (
    <div className="sf-surface-card rounded-lg overflow-hidden sf-billing-min-bars">
      <div className="px-5 py-3 border-b sf-border-default flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <span className="sf-shimmer block h-[12px] w-40 rounded-sm mt-0.5" aria-hidden="true" />
        </div>
      </div>
      <div className="p-5 flex flex-col gap-2.5">
        {Array.from({ length: 4 }, (_v, i) => (
          <div key={`bar-${i}`}>
            <div className="flex justify-between text-xs mb-1 gap-2">
              <span className="sf-shimmer block h-[12px] w-32 rounded-sm" aria-hidden="true" />
              <span className="sf-shimmer block h-[12px] w-16 rounded-sm" aria-hidden="true" />
            </div>
            <span className="sf-shimmer block h-2 w-full rounded sf-meter-track" aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EntryTableSkel() {
  const rowKeys = useMemo(
    () => Array.from({ length: 20 }, (_v, i) => `entry-skel-row-${i}`),
    [],
  );
  return (
    <div className="sf-surface-card rounded-lg overflow-hidden flex flex-col sf-billing-min-table">
      <div className="px-5 py-3 border-b sf-border-default flex items-center justify-between">
        <h3 className="text-sm font-bold">LLM Call Log</h3>
        <div className="flex items-center gap-1">
          <span className="text-[11px] sf-text-muted">Show</span>
          {[10, 20, 50, 100].map((size) => (
            <span key={size} className={`sf-pager-btn sf-shimmer${size === 20 ? ' sf-pager-btn-active' : ''}`} aria-hidden="true">{size}</span>
          ))}
        </div>
      </div>
      <div className="sf-table-shell sf-primitive-table-shell overflow-auto max-h-[calc(100vh-280px)]">
        <table className="min-w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {ENTRY_TABLE_COLUMNS.map((col) => (
              <col key={col.id} style={{ width: col.size }} />
            ))}
          </colgroup>
          <thead className="sf-table-head sticky top-0">
            <tr>
              {ENTRY_TABLE_COLUMNS.map((col) => (
                <th key={col.id} className="sf-table-head-cell" style={{ width: col.size, minWidth: col.size }}>
                  <div className="flex items-center gap-1">{col.header}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sf-border-default">
            {rowKeys.map((rowKey) => (
              <tr key={rowKey} className="sf-table-row">
                {ENTRY_TABLE_COLUMNS.map((col) => (
                  <td key={col.id} className="px-2 py-1.5 whitespace-nowrap overflow-hidden">
                    <CellSkel kind={col.kind} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 flex items-center justify-between text-[11px] sf-text-muted border-t sf-border-default">
        <span className="sf-shimmer inline-block h-[12px] w-48 rounded-sm" aria-hidden="true" />
        <div className="flex gap-0.5">
          <span className="sf-pager-btn sf-shimmer" aria-hidden="true">&larr; Prev</span>
          {[1, 2, 3, 4, 5].map((p) => (
            <span key={p} className={`sf-pager-btn sf-shimmer${p === 1 ? ' sf-pager-btn-active' : ''}`} aria-hidden="true">{p}</span>
          ))}
          <span className="sf-pager-btn sf-shimmer" aria-hidden="true">Next &rarr;</span>
        </div>
      </div>
    </div>
  );
}

export function BillingPageSkeleton() {
  return (
    <div className="space-y-4" data-region="billing-loading" aria-busy="true">
      <span className="sr-only">Loading billing dashboard</span>

      <HeroBandSkel />
      <ActionStripSkel />
      <FilterBarSkel />

      <SectionHeadingSkel label="Cost" meta="by time, type, and model" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><ChartCardSkel title="Daily Cost" /></div>
        <DonutCardSkel title="Cost by Call Type" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HorizontalBarSectionSkel title="Cost by Model" />
        <HorizontalBarSectionSkel title="Cost by Category" />
      </div>

      <SectionHeadingSkel label="Tokens" meta="prompt · completion · cached — by time, type, and model" tok />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2"><ChartCardSkel title="Daily Tokens" tokenStyle /></div>
        <PromptCachePanelSkel />
        <DonutCardSkel title="Tokens by Call Type" tokenStyle />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HorizontalBarSectionSkel title="Tokens by Model" />
        <HorizontalBarSectionSkel title="Tokens by Category" />
      </div>

      <EntryTableSkel />
    </div>
  );
}
