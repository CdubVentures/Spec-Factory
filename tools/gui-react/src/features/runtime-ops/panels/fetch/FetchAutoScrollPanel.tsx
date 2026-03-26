import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DataTable } from '../../../../shared/ui/data-display/DataTable.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { ToolBrandHeader } from '../shared/ToolBrandHeader.tsx';
import type { FetchPluginData, FetchPluginRecord } from '../../types.ts';

interface AutoScrollRecord extends FetchPluginRecord {
  enabled: boolean;
  passes: number;
  delayMs: number;
  postLoadWaitMs: number;
  strategy?: string;
}

interface FetchAutoScrollPanelProps {
  data: FetchPluginData;
  persistScope: string;
}

const SCROLL_COLUMNS: ColumnDef<AutoScrollRecord, unknown>[] = [
  { accessorKey: 'display_label', header: 'Worker', size: 120 },
  { accessorKey: 'host', header: 'Host', size: 180 },
  {
    accessorKey: 'enabled',
    header: 'Status',
    size: 100,
    cell: ({ getValue }) => {
      const on = getValue<boolean>();
      return (
        <span className={on ? 'sf-chip-success' : 'sf-chip-muted'}>
          {on ? 'Scrolled' : 'Skipped'}
        </span>
      );
    },
  },
  {
    accessorKey: 'strategy',
    header: 'Strategy',
    size: 100,
    cell: ({ getValue }) => {
      const val = getValue<string>();
      const isIncremental = val === 'incremental';
      return (
        <span className={isIncremental ? 'sf-chip-accent' : 'sf-chip-muted'}>
          {val ?? 'jump'}
        </span>
      );
    },
  },
  { accessorKey: 'passes', header: 'Passes', size: 80 },
  { accessorKey: 'delayMs', header: 'Delay (ms)', size: 100 },
  { accessorKey: 'postLoadWaitMs', header: 'Post-Wait (ms)', size: 120 },
  { accessorKey: 'ts', header: 'Timestamp', size: 200 },
];

export function FetchAutoScrollPanel({ data, persistScope }: FetchAutoScrollPanelProps) {
  const records = data.records as AutoScrollRecord[];
  const totalScrolled = useMemo(() => records.filter((r) => r.enabled && r.passes > 0).length, [records]);
  const totalSkipped = useMemo(() => records.filter((r) => !r.enabled || !r.passes).length, [records]);
  const total = records.length;
  const columns = useMemo(() => SCROLL_COLUMNS, []);

  if (total === 0) {
    return (
      <StageEmptyState
        icon="&#x1F4A8;"
        heading="Auto-Scroll"
        description="No scroll data yet. Data will appear as fetch workers process URLs."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <ToolBrandHeader tool="playwright" category="script" />
      <HeroStatGrid>
        <HeroStat value={total} label="Total Workers" />
        <HeroStat value={totalScrolled} label="Scrolled" colorClass="text-[var(--sf-token-success)]" />
        <HeroStat value={totalSkipped} label="Skipped" colorClass="text-[var(--sf-token-muted)]" />
      </HeroStatGrid>

      <SectionHeader>Scroll Log</SectionHeader>
      <DataTable
        data={records}
        columns={columns}
        persistKey={`${persistScope}:auto-scroll-log`}
      />
    </div>
  );
}
