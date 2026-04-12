import type { ReactNode } from 'react';
import { Chip } from '../feedback/Chip.tsx';
import { Tip } from '../feedback/Tip.tsx';
import { Spinner } from '../feedback/Spinner.tsx';
import { toneToChipClass } from './toneMappings.ts';
import type { StatusChipData } from './types.ts';

interface FinderPanelHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  title: string;
  chipLabel?: string;
  chipClass?: string;
  statusChip?: StatusChipData;
  tip: string;
  isRunning: boolean;
  /** True while the POST is in-flight (~50ms). Disables the button during send. */
  sendBusy?: boolean;
  /** Disable the run button (e.g. missing prerequisite data) */
  runDisabled?: boolean;
  runLabel?: string;
  onRun: () => void;
  /** Extra elements between tip and status/running badge */
  children?: ReactNode;
  /** When provided, replaces the default Run button entirely */
  actionSlot?: ReactNode;
}

export function FinderPanelHeader({
  collapsed,
  onToggle,
  title,
  chipLabel,
  chipClass = 'sf-chip-accent',
  statusChip,
  tip,
  isRunning,
  sendBusy = false,
  runDisabled = false,
  runLabel = 'Run Now',
  onRun,
  children,
  actionSlot,
}: FinderPanelHeaderProps) {
  return (
    <div className={`flex items-center gap-2.5 px-6 pt-4 ${collapsed ? 'pb-3' : 'pb-0'}`}>
      <button
        onClick={onToggle}
        className="inline-flex items-center justify-center w-5 h-5 sf-text-caption sf-icon-button"
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '+' : '-'}
      </button>
      <span className="text-[15px] font-bold sf-text-primary">{title}</span>

      {chipLabel && <Chip label={chipLabel} className={chipClass} />}
      <Tip text={tip} />

      {children}

      {isRunning ? (
        <Chip label="Running" className="sf-chip-purple animate-pulse" />
      ) : statusChip ? (
        <Chip label={statusChip.label} className={toneToChipClass(statusChip.tone)} />
      ) : null}

      {actionSlot ?? (
        <button
          onClick={(e) => { e.stopPropagation(); onRun(); }}
          disabled={sendBusy || runDisabled}
          className="ml-auto w-28 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-primary-button disabled:opacity-40 disabled:cursor-not-allowed text-center"
        >
          {sendBusy ? (
            <span className="flex items-center justify-center gap-1.5"><Spinner className="h-3 w-3" /> Sending...</span>
          ) : runLabel}
        </button>
      )}
    </div>
  );
}
