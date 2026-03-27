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

interface DomExpansionRecord extends FetchPluginRecord {
  enabled: boolean;
  selectors: string[];
  found: number;
  clicked: number;
  expanded: number;
  blocked: number;
  skippedNav: number;
  contentDelta: number;
  settleMs: number;
  budgetExhausted: boolean;
}

interface FetchDomExpansionPanelProps {
  data: FetchPluginData;
  persistScope: string;
}

const EXPANSION_COLUMNS: ColumnDef<DomExpansionRecord, unknown>[] = [
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
  { accessorKey: 'expanded', header: 'Expanded', size: 80 },
  {
    accessorKey: 'skippedNav',
    header: 'Nav Blocked',
    size: 90,
    cell: ({ getValue }) => {
      const n = getValue<number>();
      return n > 0
        ? <span className="sf-chip-warning">{n}</span>
        : <span className="sf-chip-muted">0</span>;
    },
  },
  {
    accessorKey: 'contentDelta',
    header: 'Content +/-',
    size: 100,
    cell: ({ getValue }) => {
      const d = getValue<number>();
      if (d > 0) return <span className="sf-chip-success">+{d}</span>;
      if (d < 0) return <span className="sf-chip-warning">{d}</span>;
      return <span className="sf-chip-muted">0</span>;
    },
  },
  { accessorKey: 'settleMs', header: 'Settle (ms)', size: 100 },
  { accessorKey: 'ts', header: 'Timestamp', size: 200 },
];

export function FetchDomExpansionPanel({ data, persistScope }: FetchDomExpansionPanelProps) {
  const scrollRef = usePersistedScroll(`scroll:fetchDomExpansion:${persistScope}`);
  const records = data.records as DomExpansionRecord[];
  const totalExpanded = useMemo(() => records.reduce((s, r) => s + (r.expanded ?? 0), 0), [records]);
  const totalBlocked = useMemo(() => records.reduce((s, r) => s + (r.skippedNav ?? 0) + (r.blocked ?? 0), 0), [records]);
  const totalClicks = useMemo(() => records.reduce((s, r) => s + (r.clicked ?? 0), 0), [records]);
  const totalFound = useMemo(() => records.reduce((s, r) => s + (r.found ?? 0), 0), [records]);
  const totalContentDelta = useMemo(() => records.reduce((s, r) => s + (r.contentDelta ?? 0), 0), [records]);
  const total = records.length;
  const expandRate = totalClicks > 0 ? `${Math.round((totalExpanded / totalClicks) * 100)}%` : '--';
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
    <div ref={scrollRef} className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">DOM Expansion</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Section Reveal</span>
        </>}
        trailing={<>
          <Chip label="Playwright &middot; Script" className="sf-chip-info" />
          <Tip text="Click expand/show-more buttons to reveal collapsed sections and tables." />
        </>}
      >
        <HeroStatGrid>
          <HeroStat value={total} label="Total Workers" />
          <HeroStat value={totalClicks} label="Clicks" colorClass="text-[var(--sf-token-success)]" />
          <HeroStat value={totalExpanded} label="Expanded" colorClass="text-[var(--sf-token-success)]" />
          <HeroStat value={totalBlocked} label="Nav Blocked" colorClass="text-[var(--sf-token-warning)]" />
          <HeroStat value={expandRate} label="Success Rate" />
          <HeroStat value={totalContentDelta > 0 ? `+${totalContentDelta}` : String(totalContentDelta)} label="Content Delta" />
        </HeroStatGrid>
      </HeroBand>

      <SectionHeader>Expansion Log</SectionHeader>
      <DataTable
        data={records}
        columns={columns}
        persistKey={`${persistScope}:dom-expansion-log`}
      />
    </div>
  );
}
