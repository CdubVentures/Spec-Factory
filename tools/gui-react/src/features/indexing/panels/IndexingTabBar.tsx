/**
 * IndexingTabBar — top-level navigation for the indexing lab.
 *
 * Rendered as a self-contained rounded-card nav control. Active tab fills
 * with the finder's color tint; the icon badge flips to the surface color
 * so it stays legible. Pipeline is a fixed first tab (not part of the
 * auto-generated finder registry); finders come from FINDER_PANELS.
 */

import { useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
import { INDEXING_TAB_META, getIndexingTabIds, type IndexingTabId } from './finderTabMeta.ts';
import { nextTabId, type TabNavDirection } from './finderTabKeyboard.ts';
import type { FinderTabSummary } from '../../../shared/ui/finder/tabSummary.ts';
import { FinderTabStatus } from './FinderTabStatus.tsx';
import './FinderTabBar.css';

export interface IndexingTabBarProps {
  readonly activeId: IndexingTabId;
  readonly onSelect: (id: IndexingTabId) => void;
  readonly productId: string;
  readonly category: string;
}

export function IndexingTabBar({ activeId, onSelect, productId, category }: IndexingTabBarProps) {
  const tabsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const ids = useMemo(() => getIndexingTabIds(), []);

  const handleKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const dir = keyToDirection(e.key);
    if (!dir) return;
    e.preventDefault();
    const next = nextTabId(activeId, dir, ids);
    onSelect(next);
    tabsRef.current[next]?.focus();
  }, [activeId, ids, onSelect]);

  return (
    <div
      role="tablist"
      aria-label="Indexing Lab tabs"
      onKeyDown={handleKey}
      className="finder-tab-bar flex gap-1 p-1.5 bg-sf-surface border border-sf-border-default rounded-lg shadow-sm overflow-x-auto"
    >
      {ids.map((id) => (
        <IndexingTab
          key={id}
          id={id}
          isActive={id === activeId}
          productId={productId}
          category={category}
          onSelect={onSelect}
          tabRef={(el) => { tabsRef.current[id] = el; }}
        />
      ))}
    </div>
  );
}

interface IndexingTabProps {
  readonly id: IndexingTabId;
  readonly isActive: boolean;
  readonly productId: string;
  readonly category: string;
  readonly onSelect: (id: IndexingTabId) => void;
  readonly tabRef: (el: HTMLButtonElement | null) => void;
}

function IndexingTab({ id, isActive, productId, category, onSelect, tabRef }: IndexingTabProps) {
  const meta = INDEXING_TAB_META[id];
  const summary: FinderTabSummary = meta.useTabSummary(productId, category);

  return (
    <button
      ref={tabRef}
      type="button"
      role="tab"
      id={`finder-tab-${id}`}
      aria-selected={isActive}
      aria-controls={`finder-panel-${id}`}
      tabIndex={isActive ? 0 : -1}
      data-f={meta.iconClass}
      onClick={() => onSelect(id)}
      className={[
        'finder-tab-item',
        isActive ? 'finder-tab-item-active' : '',
        'grid grid-cols-[32px_1fr_auto] items-center gap-x-2.5',
        'px-3 py-2 min-w-0 flex-1 text-left cursor-pointer',
        'rounded-md border border-transparent',
      ].filter(Boolean).join(' ')}
    >
      <span
        aria-hidden
        className={`finder-tab-icon finder-tab-icon-${meta.iconClass} inline-flex items-center justify-center w-8 h-8 rounded-md text-body font-bold`}
      >
        {meta.icon}
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="font-bold text-caption truncate">{meta.shortName}</span>
        <span className="finder-tab-kpi font-sf-mono text-nano truncate">{summary.kpi}</span>
      </span>
      <FinderTabStatus
        status={summary.status}
        percent={summary.percent}
        numerator={summary.numerator}
        denominator={summary.denominator}
      />
    </button>
  );
}

function keyToDirection(key: string): TabNavDirection | null {
  switch (key) {
    case 'ArrowRight': return 'right';
    case 'ArrowLeft':  return 'left';
    case 'Home':       return 'home';
    case 'End':        return 'end';
    default:           return null;
  }
}
