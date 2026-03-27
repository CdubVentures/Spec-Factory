import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import { DataTable } from '../../../../shared/ui/data-display/DataTable.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import type { FetchPluginData, FetchPluginRecord } from '../../types.ts';

interface StealthRecord extends FetchPluginRecord {
  injected: boolean;
  patches: string[];
}

interface FetchStealthPanelProps {
  data: FetchPluginData;
  persistScope: string;
}

const INJECTION_COLUMNS: ColumnDef<StealthRecord, unknown>[] = [
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
  const scrollRef = usePersistedScroll(`scroll:fetchStealth:${persistScope}`);
  const records = data.records as StealthRecord[];
  const totalInjected = useMemo(() => records.filter((r) => r.injected).length, [records]);
  const totalFailed = useMemo(() => records.filter((r) => !r.injected).length, [records]);
  const total = records.length;
  const successRate = total > 0 ? `${Math.round((totalInjected / total) * 100)}%` : '--';
  const patches = useMemo(() => (records[0]?.patches as string[]) ?? [], [records]);

  const columns = useMemo(() => INJECTION_COLUMNS, []);

  if (total === 0 && patches.length === 0) {
    return (
      <StageEmptyState
        icon="&#x1F6E1;"
        heading="Stealth Plugin"
        description="No stealth injection data yet. Data will appear as fetch workers process URLs."
      />
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Stealth</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Anti-Detection</span>
        </>}
        trailing={<>
          <Chip label="Playwright &middot; Script" className="sf-chip-info" />
          <Tip text="Anti-detection fingerprint injection &mdash; masks webdriver flag, spoofs plugins and languages." />
        </>}
      >
        <HeroStatGrid>
          <HeroStat value={total} label="Total Injections" />
          <HeroStat value={totalInjected} label="Successful" colorClass="text-[var(--sf-token-success)]" />
          <HeroStat value={totalFailed} label="Failed" colorClass="text-[var(--sf-token-danger)]" />
          <HeroStat value={successRate} label="Success Rate" />
        </HeroStatGrid>
      </HeroBand>

      <SectionHeader>Patches Applied</SectionHeader>
      <div className="flex flex-wrap gap-2">
        {patches.map((patch) => (
          <Chip key={patch} label={patch} className="sf-chip-info" />
        ))}
      </div>

      {records.length > 0 && (
        <>
          <SectionHeader>Injection Log</SectionHeader>
          <DataTable
            data={records}
            columns={columns}
            persistKey={`${persistScope}:stealth-injections`}
          />
        </>
      )}
    </div>
  );
}
