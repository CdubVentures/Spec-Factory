import type { ReactNode } from 'react';
import { Tip } from '../feedback/Tip';

/* ── Types ────────────────────────────────────────────────────────── */

export interface SidebarNavItem<T extends string> {
  id: T;
  label: string;
  subtitle: string;
  tip: string;
}

interface SidebarShellProps<T extends string> {
  title: string;
  items: ReadonlyArray<SidebarNavItem<T>>;
  activeItem: T;
  onSelect: (id: T) => void;
  renderIcon: (id: T, active: boolean) => ReactNode;
  headerActions?: ReactNode;
  subtitleExtra?: ReactNode;
  children: ReactNode;
}

/* ── Component ───────────────────────────────────────────────────── */

export function SidebarShell<T extends string>({
  title,
  items,
  activeItem,
  onSelect,
  renderIcon,
  headerActions,
  subtitleExtra,
  children,
}: SidebarShellProps<T>) {
  const activeData = items.find((i) => i.id === activeItem) ?? items[0];

  return (
    <div
      className="flex h-full min-h-0 rounded overflow-hidden sf-shell border"
      style={{ borderColor: 'var(--sf-surface-border)' }}
    >
      <aside className="sf-sidebar w-60 shrink-0 min-h-0 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-3">
        <div
          className="mb-3 px-2 pt-1 sf-text-caption font-bold uppercase tracking-widest"
          style={{ color: 'var(--sf-muted)' }}
        >
          {title}
        </div>
        {items.map((item) => {
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`group w-full min-h-[74px] sf-nav-item px-2.5 py-2.5 text-left ${isActive ? 'sf-nav-item-active' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                {renderIcon(item.id, isActive)}
                <div className="min-w-0 flex-1">
                  <div
                    className="sf-text-label font-semibold leading-5"
                    style={{ color: isActive ? 'rgb(var(--sf-color-accent-strong-rgb))' : 'var(--sf-text)' }}
                  >
                    {item.label}
                  </div>
                  <div className="sf-text-caption leading-4" style={{ color: 'var(--sf-muted)' }}>
                    {item.subtitle}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </aside>

      <div className="sf-shell-main flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden p-4 md:p-5 space-y-4">
        <div
          className="flex items-start justify-between gap-4 pb-4 border-b"
          style={{ borderColor: 'var(--sf-surface-border)' }}
        >
          <div className="flex items-start gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold" style={{ color: 'var(--sf-text)' }}>
                  {activeData.label}
                </h2>
                <Tip text={activeData.tip} />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                  {activeData.subtitle}
                </p>
                {subtitleExtra}
              </div>
            </div>
          </div>
          {headerActions && (
            <div className="flex flex-wrap items-start justify-end gap-3 shrink-0">{headerActions}</div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
