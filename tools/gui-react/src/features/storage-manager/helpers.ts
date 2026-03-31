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

export function groupRunsByProduct(runs: RunInventoryRow[]): ProductGroup[] {
  const map = new Map<string, RunInventoryRow[]>();
  for (const run of runs) {
    const brand = run.brand || '';
    const model = run.model || '';
    const key = brand && model ? `${brand} ${model}` : run.picker_label || run.product_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(run);
  }

  return [...map.entries()]
    .map(([key, prodRuns]) => {
      const first = prodRuns[0];
      return {
        key,
        brand: first.brand || '',
        model: first.model || '',
        runs: prodRuns.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
        totalSize: prodRuns.reduce((s, r) => s + (r.size_bytes ?? r.storage_metrics?.total_size_bytes ?? 0), 0),
      };
    })
    .sort((a, b) => b.totalSize - a.totalSize);
}
