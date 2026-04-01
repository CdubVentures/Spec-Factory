import type { RunInventoryRow } from './types.ts';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function formatDuration(startedAt: string, endedAt: string): string {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '--';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

export function formatRelativeDate(iso: string | null): string {
  if (!iso) return '--';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export interface ProductGroup {
  key: string;
  brand: string;
  model: string;
  runs: RunInventoryRow[];
  totalSize: number;
}

export function runSizeBytes(run: RunInventoryRow): number {
  return run.size_bytes ?? run.storage_metrics?.total_size_bytes ?? 0;
}

// WHY: Group by product_id (stable), not picker_label (contains run tokens).
// Display name is derived from brand+model when available, else cleaned product_id.
export function groupRunsByProduct(runs: RunInventoryRow[]): ProductGroup[] {
  const map = new Map<string, RunInventoryRow[]>();
  for (const run of runs) {
    const groupKey = run.product_id || 'unknown';
    if (!map.has(groupKey)) map.set(groupKey, []);
    map.get(groupKey)!.push(run);
  }

  return [...map.entries()]
    .map(([, prodRuns]) => {
      const first = prodRuns[0];
      const brand = first.brand || '';
      const model = first.model || '';
      const displayName = brand && model
        ? `${brand} ${model}`
        : brand || model || first.product_id;
      return {
        key: displayName,
        brand,
        model,
        runs: prodRuns.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
        totalSize: prodRuns.reduce((s, r) => s + runSizeBytes(r), 0),
      };
    })
    .sort((a, b) => b.totalSize - a.totalSize);
}
