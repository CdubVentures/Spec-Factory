import type { ReactNode } from 'react';

interface SidebarShellSkeletonProps {
  readonly title: string;
  readonly itemCount: number;
  readonly children?: ReactNode;
}

// WHY: Mirrors SidebarShell.tsx chrome — same sf-shell wrapper, sf-sidebar
// w-60 column, sf-shell-main pane, sf-nav-item button shape (min-h-[74px]
// with 32px icon + label/subtitle stack), and the same header-bar divider
// row. Used as the route-level Suspense fallback for any settings-style page
// (LLM Config, Pipeline Settings) so the chunk-load → mount transition
// keeps the same shell shape; only the nav items shimmer in place rather
// than flashing in.
export function SidebarShellSkeleton({ title, itemCount, children }: SidebarShellSkeletonProps) {
  return (
    <div
      className="flex h-full min-h-0 rounded overflow-hidden sf-shell border"
      style={{ borderColor: 'var(--sf-surface-border)' }}
      data-region="sidebar-shell-loading"
      aria-busy="true"
    >
      <span className="sr-only">Loading {title}</span>
      <aside className="sf-sidebar w-60 shrink-0 min-h-0 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-3">
        <div
          className="mb-3 px-2 pt-1 sf-text-caption font-bold uppercase tracking-widest"
          style={{ color: 'var(--sf-muted)' }}
        >
          {title}
        </div>
        {Array.from({ length: itemCount }, (_value, index) => (
          <div
            key={`nav-skel-${index}`}
            className="group relative w-full min-h-[74px] sf-nav-item px-2.5 py-2.5 text-left"
            aria-hidden="true"
          >
            <div className="flex items-center gap-2.5">
              <span className="sf-shimmer inline-flex h-8 w-8 shrink-0 rounded" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <span className="sf-shimmer block h-[14px] w-full rounded-sm" />
                <span className="sf-shimmer block h-[12px] w-full rounded-sm" />
              </div>
            </div>
          </div>
        ))}
      </aside>

      <div className="sf-shell-main flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden p-4 md:p-5 space-y-4">
        <div
          className="flex items-start justify-between gap-4 pb-4 border-b"
          style={{ borderColor: 'var(--sf-surface-border)' }}
        >
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div className="space-y-1.5 flex-1 min-w-0">
              <span className="sf-shimmer block h-[14px] w-40 rounded-sm" aria-hidden="true" />
              <span className="sf-shimmer block h-[12px] w-64 rounded-sm" aria-hidden="true" />
            </div>
          </div>
          <span
            className="sf-shimmer rounded shrink-0"
            style={{ height: '30px', width: '96px' }}
            aria-hidden="true"
          />
        </div>
        {children}
      </div>
    </div>
  );
}
