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
  const scrollRef = usePersistedScroll(`scroll:fetchCssOverride:${persistScope}`);
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
    <div ref={scrollRef} className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">CSS Override</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Element Reveal</span>
        </>}
        trailing={<>
          <Chip label="Playwright &middot; Script" className="sf-chip-info" />
          <Tip text="Force display:block on hidden elements for full capture (brute-force fallback)." />
        </>}
      >
        <HeroStatGrid>
          <HeroStat value={total} label="Total Workers" />
          <HeroStat value={totalOverridden} label="Overridden" colorClass="text-[var(--sf-token-accent)]" />
          <HeroStat value={totalSkipped} label="Skipped" colorClass="text-[var(--sf-token-muted)]" />
          <HeroStat value={totalRevealed} label="Elements Revealed" colorClass="text-[var(--sf-token-success)]" />
          <HeroStat value={domainBlockingActive ? 'Active' : 'Off'} label="Domain Blocking" colorClass={domainBlockingActive ? 'text-[var(--sf-token-info)]' : 'text-[var(--sf-token-muted)]'} />
        </HeroStatGrid>
      </HeroBand>

      <SectionHeader>Override Log</SectionHeader>
      <DataTable
        data={records}
        columns={columns}
        persistKey={`${persistScope}:css-override-log`}
      />
    </div>
  );
}
