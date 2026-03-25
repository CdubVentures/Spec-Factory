import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DataTable } from '../../../../shared/ui/data-display/DataTable.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { ToolBrandHeader } from '../shared/ToolBrandHeader.tsx';
import type { FetchStealthData, FetchStealthInjection } from '../../types.ts';

interface FetchStealthPanelProps {
  data: FetchStealthData;
  persistScope: string;
}

const INJECTION_COLUMNS: ColumnDef<FetchStealthInjection, unknown>[] = [
  { accessorKey: 'display_label', header: 'Worker', size: 120 },
  { accessorKey: 'host', header: 'Host', size: 180 },
  {
    accessorKey: 'injected',
    header: 'Status',
    size: 100,
    cell: ({ getValue }) => {
      const ok = getValue<boolean>();
      return (
        <span className={ok ? 'sf-chip-success' : 'sf-chip-danger'}>
          {ok ? 'Injected' : 'Failed'}
        </span>
      );
    },
  },
  { accessorKey: 'ts', header: 'Timestamp', size: 200 },
];

export function FetchStealthPanel({ data, persistScope }: FetchStealthPanelProps) {
  const total = data.total_injected + data.total_failed;
  const successRate = total > 0 ? `${Math.round((data.total_injected / total) * 100)}%` : '--';

  const columns = useMemo(() => INJECTION_COLUMNS, []);

  if (total === 0 && data.patches.length === 0) {
    return (
      <StageEmptyState
        icon="&#x1F6E1;"
        heading="Stealth Plugin"
        description="No stealth injection data yet. Data will appear as fetch workers process URLs."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <ToolBrandHeader tool="playwright" category="script" />
      <HeroStatGrid>
        <HeroStat value={total} label="Total Injections" />
        <HeroStat value={data.total_injected} label="Successful" colorClass="text-[var(--sf-token-success)]" />
        <HeroStat value={data.total_failed} label="Failed" colorClass="text-[var(--sf-token-danger)]" />
        <HeroStat value={successRate} label="Success Rate" />
      </HeroStatGrid>

      <SectionHeader>Patches Applied</SectionHeader>
      <div className="flex flex-wrap gap-2">
        {data.patches.map((patch) => (
          <Chip key={patch} label={patch} className="sf-chip-info" />
        ))}
      </div>

      {data.injections.length > 0 && (
        <>
          <SectionHeader>Injection Log</SectionHeader>
          <DataTable
            data={data.injections}
            columns={columns}
            persistKey={`${persistScope}:stealth-injections`}
          />
        </>
      )}
    </div>
  );
}
