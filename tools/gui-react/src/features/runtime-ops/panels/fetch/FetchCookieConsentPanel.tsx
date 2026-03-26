import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DataTable } from '../../../../shared/ui/data-display/DataTable.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { ToolBrandHeader } from '../shared/ToolBrandHeader.tsx';
import type { FetchPluginData, FetchPluginRecord } from '../../types.ts';

interface CookieConsentRecord extends FetchPluginRecord {
  enabled: boolean;
  autoconsentMatched: boolean;
  fallbackClicked: number;
  settleMs: number;
}

interface FetchCookieConsentPanelProps {
  data: FetchPluginData;
  persistScope: string;
}

const CONSENT_COLUMNS: ColumnDef<CookieConsentRecord, unknown>[] = [
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
          {on ? 'Dismissed' : 'Skipped'}
        </span>
      );
    },
  },
  {
    accessorKey: 'autoconsentMatched',
    header: 'Autoconsent',
    size: 110,
    cell: ({ getValue }) => {
      const matched = getValue<boolean>();
      return (
        <span className={matched ? 'sf-chip-success' : 'sf-chip-muted'}>
          {matched ? 'Matched' : 'No CMP'}
        </span>
      );
    },
  },
  { accessorKey: 'fallbackClicked', header: 'Fallback', size: 80 },
  { accessorKey: 'settleMs', header: 'Settle (ms)', size: 100 },
  { accessorKey: 'ts', header: 'Timestamp', size: 200 },
];

const EMPTY_RECORDS: CookieConsentRecord[] = [];

export function FetchCookieConsentPanel({ data, persistScope }: FetchCookieConsentPanelProps) {
  const records = (data?.records ?? EMPTY_RECORDS) as CookieConsentRecord[];
  const totalDismissed = useMemo(() => records.filter((r) => r.enabled && (r.autoconsentMatched || r.fallbackClicked > 0)).length, [records]);
  const totalSkipped = useMemo(() => records.filter((r) => !r.enabled).length, [records]);
  const autoconsentMatches = useMemo(() => records.filter((r) => r.autoconsentMatched).length, [records]);
  const fallbackClicks = useMemo(() => records.reduce((s, r) => s + (r.fallbackClicked ?? 0), 0), [records]);
  const total = records.length;
  const dismissRate = total > 0 ? `${Math.round((totalDismissed / total) * 100)}%` : '--';
  const columns = useMemo(() => CONSENT_COLUMNS, []);

  if (total === 0) {
    return (
      <StageEmptyState
        icon="&#x1F36A;"
        heading="Cookie Consent"
        description="No consent data yet. Data will appear as fetch workers encounter cookie/privacy banners."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <ToolBrandHeader tool="playwright" category="script" />
      <HeroStatGrid>
        <HeroStat value={total} label="Total Workers" />
        <HeroStat value={autoconsentMatches} label="Autoconsent Matches" colorClass="text-[var(--sf-token-success)]" />
        <HeroStat value={fallbackClicks} label="Fallback Clicks" />
        <HeroStat value={dismissRate} label="Dismiss Rate" />
      </HeroStatGrid>

      <SectionHeader>Consent Log</SectionHeader>
      <DataTable
        data={records}
        columns={columns}
        persistKey={`${persistScope}:cookie-consent-log`}
      />
    </div>
  );
}
