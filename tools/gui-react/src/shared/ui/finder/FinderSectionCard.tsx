import type { ReactNode } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';

interface FinderSectionCardProps {
  title: string;
  count?: string;
  storeKey: string;
  defaultOpen?: boolean;
  trailing?: ReactNode;
  children: ReactNode;
}

export function FinderSectionCard({
  title,
  count,
  storeKey,
  defaultOpen = false,
  trailing,
  children,
}: FinderSectionCardProps) {
  const [open, toggleOpen] = usePersistedToggle(`indexing:section:${storeKey}`, defaultOpen);

  return (
    <div className="sf-surface-elevated border sf-border-soft rounded-lg">
      <button
        onClick={toggleOpen}
        className="w-full flex items-center gap-2.5 p-5 cursor-pointer select-none hover:opacity-80"
      >
        <span
          className="text-[10px] sf-text-muted shrink-0"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
        >
          {'\u25B6'}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] sf-text-muted">
          {title}
        </span>
        {count && (
          <span className="text-[10px] font-mono sf-text-subtle">{count}</span>
        )}
        <div className="flex-1" />
        {trailing && <span onClick={(e) => e.stopPropagation()}>{trailing}</span>}
      </button>
      {open && (
        <div className="px-5 pb-5 flex flex-col gap-4">
          {children}
        </div>
      )}
    </div>
  );
}
