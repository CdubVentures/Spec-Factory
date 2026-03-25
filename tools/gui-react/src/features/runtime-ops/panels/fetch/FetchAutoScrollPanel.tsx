import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DataTable } from '../../../../shared/ui/data-display/DataTable.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { ToolBrandHeader } from '../shared/ToolBrandHeader.tsx';
import type { FetchAutoScrollData, FetchAutoScrollRecord } from '../../types.ts';

interface FetchAutoScrollPanelProps {
  data: FetchAutoScrollData;
  persistScope: string;
}

const SCROLL_COLUMNS: ColumnDef<FetchAutoScrollRecord, unknown>[] = [
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
  { accessorKey: 'passes', header: 'Passes', size: 80 },
  { accessorKey: 'delayMs', header: 'Delay (ms)', size: 100 },
  { accessorKey: 'postLoadWaitMs', header: 'Post-Wait (ms)', size: 120 },
  { accessorKey: 'ts', header: 'Timestamp', size: 200 },
];

export function FetchAutoScrollPanel({ data, persistScope }: FetchAutoScrollPanelProps) {
  const total = data.total_scrolled + data.total_skipped;
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
        <HeroStat value={data.total_scrolled} label="Scrolled" colorClass="text-[var(--sf-token-success)]" />
        <HeroStat value={data.total_skipped} label="Skipped" colorClass="text-[var(--sf-token-muted)]" />
      </HeroStatGrid>

      <SectionHeader>Scroll Log</SectionHeader>
      <DataTable
        data={data.scroll_records}
        columns={columns}
        persistKey={`${persistScope}:auto-scroll-log`}
      />
    </div>
  );
}
