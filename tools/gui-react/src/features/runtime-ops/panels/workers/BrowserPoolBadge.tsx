import { useMemo } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { deriveBrowserPoolState, type BrowserPoolStatus, type BrowserPoolMeta } from '../../selectors/browserPoolStatusHelpers.ts';

interface BrowserPoolBadgeProps {
  workers: ReadonlyArray<{ pool: string; state: string }>;
  slotCount: number;
  isRunning: boolean;
  browserPoolMeta?: BrowserPoolMeta | null;
}

const DOT_CLASS: Readonly<Record<BrowserPoolStatus, string>> = {
  idle: 'sf-dot-neutral opacity-50',
  warming: 'sf-dot-info',
  ready: 'sf-dot-success',
};

const CHIP_CLASS: Readonly<Record<BrowserPoolStatus, string>> = {
  idle: 'sf-chip-neutral opacity-60',
  warming: 'sf-chip-info',
  ready: 'sf-chip-success',
};

export function BrowserPoolBadge({ workers, slotCount, isRunning, browserPoolMeta }: BrowserPoolBadgeProps) {
  const state = useMemo(
    () => deriveBrowserPoolState(workers, slotCount, browserPoolMeta),
    [workers, slotCount, browserPoolMeta],
  );

  const label = state.status === 'warming'
    ? `${state.activeFetchSlots}/${state.totalSlots}`
    : state.status === 'ready' ? 'Ready' : 'Idle';

  const dotAnim = state.status === 'warming' && isRunning ? 'animate-dot-bounce' : '';

  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${CHIP_CLASS[state.status]}`}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${DOT_CLASS[state.status]} ${dotAnim}`} />
          <span className="font-mono">{state.browsersNeeded}&times;{state.pagesPerBrowser}</span>
          <span className="sf-text-caption">{label}</span>
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="z-50 max-w-xs px-3 py-2 sf-text-caption leading-snug sf-text-primary sf-surface-elevated border sf-border-default rounded shadow-lg"
          sideOffset={6}
          side="bottom"
        >
          {state.browsersNeeded} browser{state.browsersNeeded !== 1 ? 's' : ''} &middot; {state.pagesPerBrowser} page{state.pagesPerBrowser !== 1 ? 's' : ''} each &middot; {state.totalSlots} total slots
          <Tooltip.Arrow className="fill-current sf-text-primary" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
