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

interface OverlayDismissalRecord extends FetchPluginRecord {
  enabled: boolean;
  cssInjected: boolean;
  overlaysDetected: number;
  closeClicked: number;
  domRemoved: number;
  scrollLockReset: boolean;
  observerCaught: number;
  settleMs: number;
}

interface FetchOverlayDismissalPanelProps {
  data: FetchPluginData;
  persistScope: string;
}

const OVERLAY_COLUMNS: ColumnDef<OverlayDismissalRecord, unknown>[] = [
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
          {on ? 'Active' : 'Skipped'}
        </span>
      );
    },
  },
  { accessorKey: 'overlaysDetected', header: 'Detected', size: 80 },
  { accessorKey: 'closeClicked', header: 'Closed', size: 80 },
  { accessorKey: 'domRemoved', header: 'Removed', size: 80 },
  { accessorKey: 'observerCaught', header: 'Observer', size: 80 },
  {
    accessorKey: 'scrollLockReset',
    header: 'Scroll Fix',
    size: 90,
    cell: ({ getValue }) => {
      const reset = getValue<boolean>();
      return reset
        ? <span className="sf-chip-warning">Reset</span>
        : <span className="sf-chip-muted">OK</span>;
    },
  },
  { accessorKey: 'settleMs', header: 'Settle (ms)', size: 100 },
  { accessorKey: 'ts', header: 'Timestamp', size: 200 },
];

export function FetchOverlayDismissalPanel({ data, persistScope }: FetchOverlayDismissalPanelProps) {
  const scrollRef = usePersistedScroll(`scroll:fetchOverlayDismissal:${persistScope}`);
  const records = data.records as OverlayDismissalRecord[];
  const totalDetected = useMemo(() => records.reduce((s, r) => s + (r.overlaysDetected ?? 0), 0), [records]);
  const totalClosed = useMemo(() => records.reduce((s, r) => s + (r.closeClicked ?? 0), 0), [records]);
  const totalRemoved = useMemo(() => records.reduce((s, r) => s + (r.domRemoved ?? 0), 0), [records]);
  const totalObserver = useMemo(() => records.reduce((s, r) => s + (r.observerCaught ?? 0), 0), [records]);
  const totalScrollFixes = useMemo(() => records.filter((r) => r.scrollLockReset).length, [records]);
  const total = records.length;
  const columns = useMemo(() => OVERLAY_COLUMNS, []);

  if (total === 0) {
    return (
      <StageEmptyState
        icon="&#x1F6E1;"
        heading="Overlay Dismissal"
        description="No overlay data yet. Data will appear as fetch workers process URLs with popups, modals, and overlays."
      />
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Overlay Dismissal</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Popup Shield</span>
        </>}
        trailing={<>
          <Chip label="CSS + Heuristic + Observer" className="sf-chip-info" />
          <Tip text="3-layer popup dismissal: CSS suppression, heuristic DOM scan with close-click, and MutationObserver guard." />
        </>}
      >
        <HeroStatGrid>
          <HeroStat value={total} label="Total Workers" />
          <HeroStat value={totalDetected} label="Detected" colorClass="text-[var(--sf-token-warning)]" />
          <HeroStat value={totalClosed} label="Close-Clicked" colorClass="text-[var(--sf-token-success)]" />
          <HeroStat value={totalRemoved} label="DOM Removed" colorClass="text-[var(--sf-token-warning)]" />
          <HeroStat value={totalObserver} label="Observer Caught" />
          <HeroStat value={totalScrollFixes} label="Scroll Fixes" />
        </HeroStatGrid>
      </HeroBand>

      <SectionHeader>Dismissal Log</SectionHeader>
      <DataTable
        data={records}
        columns={columns}
        persistKey={`${persistScope}:overlay-dismissal-log`}
      />
    </div>
  );
}
