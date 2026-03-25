import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DataTable } from '../../../../shared/ui/data-display/DataTable.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { ToolBrandHeader } from '../shared/ToolBrandHeader.tsx';
import type { FetchCssOverrideData, FetchCssOverrideRecord } from '../../types.ts';

interface FetchCssOverridePanelProps {
  data: FetchCssOverrideData;
  persistScope: string;
}

const OVERRIDE_COLUMNS: ColumnDef<FetchCssOverrideRecord, unknown>[] = [
  { accessorKey: 'display_label', header: 'Worker', size: 120 },
  { accessorKey: 'host', header: 'Host', size: 180 },
  {
    accessorKey: 'enabled',
    header: 'Status',
    size: 100,
    cell: ({ getValue }) => {
      const on = getValue<boolean>();
      return (
        <span className={on ? 'sf-chip-accent' : 'sf-chip-muted'}>
          {on ? 'Overridden' : 'Skipped'}
        </span>
      );
    },
  },
  { accessorKey: 'hiddenBefore', header: 'Hidden', size: 80 },
  { accessorKey: 'revealedAfter', header: 'Revealed', size: 80 },
  { accessorKey: 'ts', header: 'Timestamp', size: 200 },
];

export function FetchCssOverridePanel({ data, persistScope }: FetchCssOverridePanelProps) {
  const total = data.total_overridden + data.total_skipped;
  const columns = useMemo(() => OVERRIDE_COLUMNS, []);

  if (total === 0) {
    return (
      <StageEmptyState
        icon="&#x1F3A8;"
        heading="CSS Override"
        description="No override data yet. This plugin is off by default — enable it in settings to force-display hidden elements."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <ToolBrandHeader tool="playwright" category="script" />
      <HeroStatGrid>
        <HeroStat value={total} label="Total Workers" />
        <HeroStat value={data.total_overridden} label="Overridden" colorClass="text-[var(--sf-token-accent)]" />
        <HeroStat value={data.total_skipped} label="Skipped" colorClass="text-[var(--sf-token-muted)]" />
        <HeroStat value={data.total_elements_revealed} label="Elements Revealed" colorClass="text-[var(--sf-token-success)]" />
      </HeroStatGrid>

      <SectionHeader>Override Log</SectionHeader>
      <DataTable
        data={data.override_records}
        columns={columns}
        persistKey={`${persistScope}:css-override-log`}
      />
    </div>
  );
}
