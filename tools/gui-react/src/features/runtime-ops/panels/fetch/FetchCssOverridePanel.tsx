import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DataTable } from '../../../../shared/ui/data-display/DataTable.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { ToolBrandHeader } from '../shared/ToolBrandHeader.tsx';
import type { FetchPluginData, FetchPluginRecord } from '../../types.ts';

interface CssOverrideRecord extends FetchPluginRecord {
  enabled: boolean;
  hiddenBefore: number;
  revealedAfter: number;
  fixedRemoved?: boolean;
  domainBlockingEnabled?: boolean;
}

interface FetchCssOverridePanelProps {
  data: FetchPluginData;
  persistScope: string;
}

const OVERRIDE_COLUMNS: ColumnDef<CssOverrideRecord, unknown>[] = [
  { accessorKey: 'display_label', header: 'Worker', size: 120 },
  { accessorKey: 'host', header: 'Host', size: 180 },
  {
    accessorKey: 'enabled',
    header: 'Status',
    size: 100,
    cell: ({ getValue }) => {
      const ok = getValue<boolean>();
      return (
        <span className={ok ? 'sf-chip-accent' : 'sf-chip-muted'}>
          {ok ? 'Overridden' : 'Skipped'}
        </span>
      );
    },
  },
  { accessorKey: 'hiddenBefore', header: 'Hidden', size: 80 },
  { accessorKey: 'revealedAfter', header: 'Revealed', size: 80 },
  {
    accessorKey: 'fixedRemoved',
    header: 'Fixed Removed',
    size: 110,
    cell: ({ getValue }) => {
      const val = getValue<boolean>();
      return (
        <span className={val ? 'sf-chip-info' : 'sf-chip-muted'}>
          {val ? 'Yes' : 'No'}
        </span>
      );
    },
  },
  { accessorKey: 'ts', header: 'Timestamp', size: 200 },
];

export function FetchCssOverridePanel({ data, persistScope }: FetchCssOverridePanelProps) {
  const records = data.records as CssOverrideRecord[];
  const totalOverridden = useMemo(() => records.filter((r) => r.enabled && r.hiddenBefore > 0).length, [records]);
  const totalSkipped = useMemo(() => records.filter((r) => !r.enabled || !r.hiddenBefore).length, [records]);
  const totalRevealed = useMemo(() => records.reduce((s, r) => s + (r.revealedAfter ?? 0), 0), [records]);
  const domainBlockingActive = useMemo(() => records.some((r) => r.domainBlockingEnabled), [records]);
  const total = records.length;
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
        <HeroStat value={totalOverridden} label="Overridden" colorClass="text-[var(--sf-token-accent)]" />
        <HeroStat value={totalSkipped} label="Skipped" colorClass="text-[var(--sf-token-muted)]" />
        <HeroStat value={totalRevealed} label="Elements Revealed" colorClass="text-[var(--sf-token-success)]" />
        <HeroStat value={domainBlockingActive ? 'Active' : 'Off'} label="Domain Blocking" colorClass={domainBlockingActive ? 'text-[var(--sf-token-info)]' : 'text-[var(--sf-token-muted)]'} />
      </HeroStatGrid>

      <SectionHeader>Override Log</SectionHeader>
      <DataTable
        data={records}
        columns={columns}
        persistKey={`${persistScope}:css-override-log`}
      />
    </div>
  );
}
