import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { btnPrimary } from '../../../shared/ui/buttonClasses.ts';
import { inputCls } from '../../../utils/studioConstants.ts';

const COLOR_COLUMNS = ['base', 'light', 'dark', 'muted'] as const;
const COLOR_ROWS = Array.from({ length: 8 }, (_value, index) => `color-row-${index}`);

function ColorCardSkeleton({ column }: { readonly column: string }) {
  return (
    <div
      className="relative flex items-center gap-3 px-4 py-2 transition-colors sf-hover-bg-surface-soft group cursor-pointer"
      data-region="color-registry-loading-color-card"
      data-skeleton-cell-column={column}
    >
      <div className="w-6 h-6 rounded-md flex-shrink-0 border sf-border-soft shadow-sm sf-shimmer" />
      <span className="font-mono text-[11px] sf-text-primary font-medium truncate flex-1 leading-tight">
        <SkeletonBlock className="sf-skel-caption" />
      </span>
      <span className="font-mono text-[10px] sf-text-muted flex-shrink-0 tabular-nums">
        <SkeletonBlock className="sf-skel-caption" />
      </span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
        <button type="button" className="p-1 rounded sf-icon-button" disabled>
          <SkeletonBlock className="sf-skel-caption" />
        </button>
      </div>
    </div>
  );
}

function MatrixSkeleton() {
  return (
    <div className="sf-surface-elevated rounded border sf-border-soft overflow-hidden" data-region="color-registry-loading-matrix">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[600px]" aria-hidden="true">
          <thead>
            <tr className="border-b-[1.5px] border-[var(--sf-token-text-primary)]">
              {COLOR_COLUMNS.map((column) => (
                <th
                  key={column}
                  className="text-left px-4 py-3 text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary whitespace-nowrap"
                  data-skeleton-column={column}
                >
                  <SkeletonBlock className="sf-skel-caption" />
                  <span className="ml-2 text-[10px] font-normal sf-text-subtle">
                    <SkeletonBlock className="sf-skel-caption" />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COLOR_ROWS.map((row) => (
              <tr key={row} className="border-b sf-border-soft last:border-b-0" data-skeleton-row={row}>
                {COLOR_COLUMNS.map((column) => (
                  <td key={`${row}-${column}`} className="align-top p-0">
                    <ColorCardSkeleton column={column} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ColorRegistryPageSkeleton() {
  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="color-registry-loading-skeleton" data-region="color-registry-loading-page" aria-busy="true">
      <div className="flex items-center gap-4 mb-4" data-region="color-registry-loading-header">
        <h1 className="text-lg font-semibold sf-text-primary">Color Registry</h1>
        <span className="sf-text-subtle text-xs font-mono">
          <SkeletonBlock className="sf-skel-caption" />
        </span>
        <div className="flex-1" />
        <input
          type="text"
          className={`${inputCls} max-w-xs text-sm`}
          placeholder="Search colors..."
          data-region="color-registry-loading-search"
          disabled
        />
        <button type="button" className={btnPrimary} data-region="color-registry-loading-action" disabled>
          + Base Color
        </button>
        <button type="button" className={btnPrimary} data-region="color-registry-loading-action" disabled>
          + Add Group
        </button>
      </div>
      <MatrixSkeleton />
      <span className="sr-only">Loading color registry</span>
    </div>
  );
}
