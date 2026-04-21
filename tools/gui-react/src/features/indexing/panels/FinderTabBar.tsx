/**
 * FinderTabBar — top-level navigation for the four indexing finders
 * (CEF, PIF, RDF, SKU). Data-driven from FINDER_PANELS + FINDER_TAB_META so
 * adding a new finder tab is a two-file change (see finderTabMeta.ts header).
 */

import { useCallback, useRef, type KeyboardEvent } from 'react';
import { FINDER_PANELS } from '../state/finderPanelRegistry.generated.ts';
import { FINDER_TAB_META, type FinderPanelId } from './finderTabMeta.ts';
import { nextTabId, type TabNavDirection } from './finderTabKeyboard.ts';
import type { FinderTabStatus, FinderTabSummary } from '../../../shared/ui/finder/tabSummary.ts';
import './FinderTabBar.css';

export interface FinderTabBarProps {
  readonly activeId: FinderPanelId;
  readonly onSelect: (id: FinderPanelId) => void;
  readonly productId: string;
  readonly category: string;
}

export function FinderTabBar({ activeId, onSelect, productId, category }: FinderTabBarProps) {
  const tabsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const ids = FINDER_PANELS.map((p) => p.id) as readonly FinderPanelId[];

  const handleKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const dir = keyToDirection(e.key);
    if (!dir) return;
    e.preventDefault();
    const next = nextTabId(activeId, dir, ids);
    onSelect(next);
    // Move focus to the newly-active tab so the visible focus ring tracks selection.
    tabsRef.current[next]?.focus();
  }, [activeId, ids, onSelect]);

  return (
    <div
      role="tablist"
      aria-label="Indexing Lab finders"
      onKeyDown={handleKey}
      className="finder-tab-bar sf-tab-strip flex gap-1.5 p-1.5 overflow-x-auto"
    >
      {FINDER_PANELS.map((panel) => (
        <FinderTab
          key={panel.id}
          id={panel.id as FinderPanelId}
          isActive={panel.id === activeId}
          productId={productId}
          category={category}
          onSelect={onSelect}
          tabRef={(el) => { tabsRef.current[panel.id] = el; }}
        />
      ))}
    </div>
  );
}

interface FinderTabProps {
  readonly id: FinderPanelId;
  readonly isActive: boolean;
  readonly productId: string;
  readonly category: string;
  readonly onSelect: (id: FinderPanelId) => void;
  readonly tabRef: (el: HTMLButtonElement | null) => void;
}

function FinderTab({ id, isActive, productId, category, onSelect, tabRef }: FinderTabProps) {
  const meta = FINDER_TAB_META[id];
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
      onClick={() => onSelect(id)}
      className={[
        'sf-tab-item',
        isActive ? 'sf-tab-item-active' : '',
        'flex items-center gap-2.5 px-3 py-2 min-w-[180px] flex-1 text-left cursor-pointer',
      ].filter(Boolean).join(' ')}
    >
      <span
        aria-hidden
        className={`finder-tab-icon finder-tab-icon-${meta.iconClass} inline-flex items-center justify-center w-7 h-7 rounded-md font-bold text-body`}
      >
        {meta.icon}
      </span>
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="font-bold text-caption truncate">{meta.shortName}</span>
        <span className="font-sf-mono text-nano sf-text-subtle truncate">{summary.kpi}</span>
      </span>
      <StatusDot status={summary.status} />
    </button>
  );
}

function StatusDot({ status }: { readonly status: FinderTabStatus }) {
  return (
    <span
      aria-label={`status: ${status}`}
      className={`finder-tab-status finder-tab-status-${status} inline-block w-2.5 h-2.5 rounded-full shrink-0`}
    />
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
