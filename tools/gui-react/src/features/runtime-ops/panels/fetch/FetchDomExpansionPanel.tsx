import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DataTable } from '../../../../shared/ui/data-display/DataTable.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { ToolBrandHeader } from '../shared/ToolBrandHeader.tsx';
import type { FetchDomExpansionData, FetchDomExpansionRecord } from '../../types.ts';

interface FetchDomExpansionPanelProps {
  data: FetchDomExpansionData;
  persistScope: string;
}

const EXPANSION_COLUMNS: ColumnDef<FetchDomExpansionRecord, unknown>[] = [
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
          {on ? 'Expanded' : 'Skipped'}
        </span>
      );
    },
  },
  { accessorKey: 'found', header: 'Found', size: 80 },
  { accessorKey: 'clicked', header: 'Clicked', size: 80 },
  { accessorKey: 'settleMs', header: 'Settle (ms)', size: 100 },
  { accessorKey: 'ts', header: 'Timestamp', size: 200 },
];

export function FetchDomExpansionPanel({ data, persistScope }: FetchDomExpansionPanelProps) {
  const total = data.total_expanded + data.total_skipped;
  const expandRate = data.total_found > 0 ? `${Math.round((data.total_clicks / data.total_found) * 100)}%` : '--';
  const columns = useMemo(() => EXPANSION_COLUMNS, []);

  if (total === 0) {
    return (
      <StageEmptyState
        icon="&#x1F9BE;"
        heading="DOM Expansion"
        description="No expansion data yet. Data will appear as fetch workers process URLs with collapsible sections."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <ToolBrandHeader tool="playwright" category="script" />
      <HeroStatGrid>
        <HeroStat value={total} label="Total Workers" />
        <HeroStat value={data.total_clicks} label="Clicks" colorClass="text-[var(--sf-token-success)]" />
        <HeroStat value={data.total_found} label="Elements Found" />
        <HeroStat value={expandRate} label="Click Rate" />
      </HeroStatGrid>

      <SectionHeader>Expansion Log</SectionHeader>
      <DataTable
        data={data.expansion_records}
        columns={columns}
        persistKey={`${persistScope}:dom-expansion-log`}
      />
    </div>
  );
}
