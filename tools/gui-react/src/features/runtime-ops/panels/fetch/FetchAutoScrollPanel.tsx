import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import { DataTable } from '../../../../shared/ui/data-display/DataTable.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
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
  const scrollRef = usePersistedScroll(`scroll:fetchAutoScroll:${persistScope}`);
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
    <div ref={scrollRef} className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Auto-Scroll</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Content Loading</span>
        </>}
        trailing={<>
          <Chip label="Playwright &middot; Script" className="sf-chip-info" />
          <Tip text="Scroll passes to trigger lazy-loaded content and reveal dynamic elements." />
        </>}
      >
        <HeroStatGrid>
          <HeroStat value={total} label="Total Workers" />
          <HeroStat value={totalScrolled} label="Scrolled" colorClass="text-[var(--sf-token-success)]" />
          <HeroStat value={totalSkipped} label="Skipped" colorClass="text-[var(--sf-token-muted)]" />
        </HeroStatGrid>
      </HeroBand>

      <SectionHeader>Scroll Log</SectionHeader>
      <DataTable
        data={records}
        columns={columns}
        persistKey={`${persistScope}:auto-scroll-log`}
      />
    </div>
  );
}
