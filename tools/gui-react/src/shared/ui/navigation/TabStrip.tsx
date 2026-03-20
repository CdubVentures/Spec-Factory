import type { ReactNode } from 'react';

/* ── Logic helpers (exported for unit testing) ───────────────────── */

const BASE_CLS = 'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer sf-tab-item';

export function buildTabItemClass(active: boolean): string {
  return active ? `${BASE_CLS} sf-tab-item-active` : BASE_CLS;
}

export function formatTabLabel(label: string, count?: number): string {
  return count != null ? `${label} (${count})` : label;
}

/* ── Types ────────────────────────────────────────────────────────── */

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  description?: string;
}

interface TabStripProps<T extends string> {
  tabs: ReadonlyArray<TabItem<T>>;
  activeTab: T;
  onSelect: (tabId: T) => void;
  className?: string;
  children?: ReactNode;
}

/* ── Component ───────────────────────────────────────────────────── */

export function TabStrip<T extends string>({
  tabs,
  activeTab,
  onSelect,
  className = 'flex gap-1 px-1 py-1 sf-tab-strip rounded',
  children,
}: TabStripProps<T>) {
  return (
    <nav className={className}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          title={tab.description}
          onClick={() => onSelect(tab.id)}
          className={buildTabItemClass(activeTab === tab.id)}
        >
          {formatTabLabel(tab.label, tab.count)}
        </button>
      ))}
      {children}
    </nav>
  );
}
