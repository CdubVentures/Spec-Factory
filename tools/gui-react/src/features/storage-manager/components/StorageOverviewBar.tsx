import { useMemo } from 'react';
import { Tip } from '@/shared/ui/feedback/Tip';
import type { RunInventoryRow } from '../types.ts';
import { formatBytes, runSizeBytes } from '../helpers.ts';
import { StorageBreakdownDonut } from './StorageBreakdownDonut.tsx';
import { RunStatusBar } from './RunStatusBar.tsx';
import { StorageOverviewSkeleton } from './StorageLoadingSkeleton.tsx';

/* ── KPI Card (mirrors RuntimeOps OverviewTab pattern) ────────── */

interface KpiCardProps {
  value: string | number;
  label: string;
  accentClass?: string;
  tip?: string;
}

function KpiCard({ value, label, accentClass = 'sf-meter-fill', tip }: KpiCardProps) {
  return (
    <div className="sf-surface-card rounded-lg overflow-hidden">
      <div className={`h-[3px] ${accentClass}`} />
      <div className="px-4 pt-3.5 pb-3">
        <div className="text-2xl font-extrabold leading-none tracking-tight sf-text-primary">
          {value}
        </div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
          {label}
          {tip && <Tip text={tip} />}
        </div>
      </div>
    </div>
  );
}

/* ── Props ────────────────────────────────────────────────────── */

interface StorageOverviewBarProps {
  runs: RunInventoryRow[];
  isLoading: boolean;
}

/* ── Component ────────────────────────────────────────────────── */

export function StorageOverviewBar({ runs, isLoading }: StorageOverviewBarProps) {
  // WHY: Derive all overview stats from runs array — no separate overview endpoint needed.
  const stats = useMemo(() => {
    const totalRuns = runs.length;
    const totalSize = runs.reduce((s, r) => s + runSizeBytes(r), 0);
    const products = new Set(runs.map((r) => r.product_id).filter(Boolean));
    const avgSize = totalRuns > 0 ? Math.round(totalSize / totalRuns) : 0;
    let oldest = '';
    let newest = '';
    for (const r of runs) {
      const started = (r.started_at || '').trim();
      if (started && (!oldest || started < oldest)) oldest = started;
      if (started && (!newest || started > newest)) newest = started;
    }
    return { totalRuns, totalSize, productsIndexed: products.size, avgSize, oldest: oldest || null, newest: newest || null };
  }, [runs]);

  if (isLoading) {
    return <StorageOverviewSkeleton />;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold sf-text-primary">Storage Overview</h2>

      {/* ── Row 1: KPI Cards ────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          value={stats.totalRuns}
          label="Total Runs"
          accentClass="sf-meter-fill"
          tip="Total indexing runs stored for this category."
        />
        <KpiCard
          value={stats.totalSize > 0 ? formatBytes(stats.totalSize) : '0 B'}
          label="Total Size"
          accentClass="sf-meter-fill-success"
          tip="Combined disk usage of all stored run artifacts."
        />
        <KpiCard
          value={stats.productsIndexed}
          label="Products"
          accentClass="sf-meter-fill-info"
          tip="Distinct products with at least one stored run."
        />
        <KpiCard
          value={stats.avgSize > 0 ? formatBytes(stats.avgSize) : '0 B'}
          label="Avg Run Size"
          accentClass="sf-meter-fill-warning"
          tip="Average disk usage per run."
        />
      </div>

      {/* ── Row 2: Donut + Status ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <StorageBreakdownDonut runs={runs} />
        <RunStatusBar runs={runs} oldestRun={stats.oldest} newestRun={stats.newest} />
      </div>
    </div>
  );
}
