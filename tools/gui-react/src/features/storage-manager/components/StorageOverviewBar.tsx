import { HeroBand } from '@/shared/ui/data-display/HeroBand';
import { HeroStat, HeroStatGrid } from '../../runtime-ops/components/HeroStat';
import { Chip } from '@/shared/ui/feedback/Chip';
import { Tip } from '@/shared/ui/feedback/Tip';
import type { StorageOverviewResponse } from '../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function formatSizeOrDash(overview: StorageOverviewResponse): string {
  if (overview.total_runs > 0 && overview.total_size_bytes === 0) return '--';
  return formatBytes(overview.total_size_bytes);
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '--';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function backendDetailText(overview: StorageOverviewResponse): string {
  const d = overview.backend_detail;
  if (d.root_path) return d.root_path;
  if (d.bucket) return `s3://${d.bucket}/${d.prefix ?? ''}`;
  return '';
}

interface StorageOverviewBarProps {
  overview: StorageOverviewResponse | undefined;
  isLoading: boolean;
}

export function StorageOverviewBar({ overview, isLoading }: StorageOverviewBarProps) {
  if (isLoading || !overview) {
    return (
      <HeroBand
        titleRow={<h2 className="text-lg font-bold">Storage Overview</h2>}
      >
        <div className="text-sm sf-text-muted">Loading storage data...</div>
      </HeroBand>
    );
  }

  const detailText = backendDetailText(overview);

  return (
    <HeroBand
      titleRow={<h2 className="text-lg font-bold">Storage Overview</h2>}
      trailing={
        <Chip
          label={overview.storage_backend}
          className={overview.storage_backend === 's3' ? 'sf-chip-accent' : 'sf-chip-neutral'}
        />
      }
      footer={
        <>
          <span>Oldest: {formatRelativeDate(overview.oldest_run)}</span>
          <span>Newest: {formatRelativeDate(overview.newest_run)}</span>
          <span>Avg size: {formatBytes(overview.avg_run_size_bytes)}</span>
          {detailText && <Tip text={detailText} className="ml-auto" />}
        </>
      }
    >
      <HeroStatGrid columns={4}>
        <HeroStat value={overview.total_runs} label="Total Runs" />
        <HeroStat value={formatSizeOrDash(overview)} label="Total Size" />
        <HeroStat value={overview.products_indexed} label="Products" />
        <HeroStat value={overview.categories.length} label="Categories" />
      </HeroStatGrid>
    </HeroBand>
  );
}
