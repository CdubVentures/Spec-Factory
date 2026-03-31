import { Chip } from '@/shared/ui/feedback/Chip';
import { Tip } from '@/shared/ui/feedback/Tip';
import type { StorageOverviewResponse, RunInventoryRow } from '../types.ts';
import { formatBytes } from '../helpers.ts';
import { StorageBreakdownDonut } from './StorageBreakdownDonut.tsx';
import { RunStatusBar } from './RunStatusBar.tsx';

/* ── Helpers ──────────────────────────────────────────────────── */

function formatSizeOrDash(overview: StorageOverviewResponse): string {
  if (overview.total_runs > 0 && overview.total_size_bytes === 0) return '--';
  return formatBytes(overview.total_size_bytes);
}

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
  overview: StorageOverviewResponse | undefined;
  runs: RunInventoryRow[];
  isLoading: boolean;
}

/* ── Component ────────────────────────────────────────────────── */

export function StorageOverviewBar({ overview, runs, isLoading }: StorageOverviewBarProps) {
  if (isLoading || !overview) {
    return (
      <div className="sf-surface-card rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold sf-text-primary">Storage Overview</h2>
        </div>
        <div className="text-sm sf-text-muted">Loading storage data...</div>
      </div>
    );
  }

  const detailText = overview.backend_detail.root_path ?? '';

  return (
    <div className="space-y-3">
      {/* ── Header ──────────────────────────────── */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold sf-text-primary">Storage Overview</h2>
        <Chip label={overview.storage_backend} className="sf-chip-neutral" />
        {detailText && <Tip text={detailText} className="ml-auto" />}
      </div>

      {/* ── Row 1: KPI Cards ────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          value={overview.total_runs}
          label="Total Runs"
          accentClass="sf-meter-fill"
          tip="Total number of indexing runs stored for this category."
        />
        <KpiCard
          value={formatSizeOrDash(overview)}
          label="Total Size"
          accentClass="sf-meter-fill-success"
          tip="Combined disk usage of all stored run artifacts."
        />
        <KpiCard
          value={overview.products_indexed}
          label="Products"
          accentClass="sf-meter-fill-info"
          tip="Number of distinct products with at least one stored run."
        />
        <KpiCard
          value={formatBytes(overview.avg_run_size_bytes)}
          label="Avg Run Size"
          accentClass="sf-meter-fill-warning"
          tip="Average disk usage per run."
        />
      </div>

      {/* ── Row 2: Donut + Status ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <StorageBreakdownDonut runs={runs} />
        <RunStatusBar
          runs={runs}
          oldestRun={overview.oldest_run}
          newestRun={overview.newest_run}
        />
      </div>
    </div>
  );
}
