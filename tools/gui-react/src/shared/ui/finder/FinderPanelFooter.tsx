import type { ReactNode } from 'react';

interface FinderPanelFooterProps {
  lastRanAt?: string;
  runCount: number;
  /** Optional model badge + label element to display */
  modelSlot?: ReactNode;
  children?: ReactNode;
}

export function FinderPanelFooter({ lastRanAt, runCount, modelSlot, children }: FinderPanelFooterProps) {
  return (
    <div className="flex items-center gap-3 pt-4 border-t sf-border-soft text-[10px] sf-text-muted">
      <span>Last run: <strong className="sf-text-subtle">{lastRanAt?.split('T')[0] ?? '--'}</strong></span>
      <span>&middot;</span>
      {modelSlot && (
        <>
          <span className="inline-flex items-center gap-1.5">Model: {modelSlot}</span>
          <span>&middot;</span>
        </>
      )}
      <span>Runs: <strong className="sf-text-subtle">{runCount}</strong></span>
      {children}
    </div>
  );
}
