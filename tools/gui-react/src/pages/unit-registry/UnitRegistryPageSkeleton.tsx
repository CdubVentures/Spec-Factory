import { SkeletonBlock } from '../../shared/ui/feedback/SkeletonBlock.tsx';
import { btnPrimary } from '../../shared/ui/buttonClasses.ts';

interface UnitSkeletonColumn {
  readonly id: string;
  readonly className: string;
}

const UNIT_SKELETON_COLUMNS: readonly UnitSkeletonColumn[] = [
  { id: 'unit', className: 'px-4 py-2.5 font-medium sf-text-caption w-28' },
  { id: 'label', className: 'px-4 py-2.5 font-medium sf-text-caption w-36' },
  { id: 'synonyms', className: 'px-4 py-2.5 font-medium sf-text-caption w-44' },
  { id: 'formulas', className: 'px-4 py-2.5 font-medium sf-text-caption' },
  { id: 'actions', className: 'px-4 py-2.5 font-medium sf-text-caption w-16' },
];

const UNIT_SKELETON_GROUPS = ['Mass', 'Length', 'Electrical'] as const;
const UNIT_SKELETON_ROWS = Array.from({ length: 3 }, (_value, index) => `row-${index}`);

function HeaderSkeleton() {
  return (
    <div className="flex items-center justify-between mb-6" data-region="unit-registry-loading-header">
      <div>
        <h1 className="text-xl font-semibold sf-text-primary">Unit Registry</h1>
        <p className="text-xs sf-text-muted mt-0.5">
          <SkeletonBlock className="sf-skel-caption" />
        </p>
      </div>
      <div className="flex items-stretch gap-2">
        <div
          className="sf-input rounded border px-3 py-2 text-sm sf-text-label w-64 sf-shimmer"
          data-region="unit-registry-loading-search"
          aria-hidden="true"
        />
        <button
          type="button"
          className={`${btnPrimary} whitespace-nowrap`}
          data-region="unit-registry-loading-add-button"
          disabled
        >
          + Add Unit
        </button>
      </div>
    </div>
  );
}

function CellSkeleton({ columnId }: { readonly columnId: string }) {
  if (columnId === 'unit') {
    return (
      <span
        className="sf-shimmer inline-block h-6 w-16 rounded-md"
        aria-hidden="true"
      />
    );
  }
  if (columnId === 'label') {
    return <SkeletonBlock className="sf-skel-bar-label" />;
  }
  if (columnId === 'synonyms') {
    return (
      <div className="flex flex-wrap gap-1">
        <span className="sf-shimmer inline-block h-5 w-12 rounded" aria-hidden="true" />
        <span className="sf-shimmer inline-block h-5 w-10 rounded" aria-hidden="true" />
      </div>
    );
  }
  if (columnId === 'formulas') {
    return (
      <span
        className="sf-shimmer block h-3.5 w-full rounded-sm"
        aria-hidden="true"
      />
    );
  }
  if (columnId === 'actions') {
    return (
      <span className="inline-flex justify-end w-full">
        <span className="sf-shimmer inline-block h-7 w-7 rounded" aria-hidden="true" />
      </span>
    );
  }
  return <SkeletonBlock className="sf-skel-bar" />;
}

function GroupSkeleton({ group }: { readonly group: string }) {
  return (
    <>
      <tr data-skeleton-group={group}>
        <td colSpan={5} className="px-4 pt-4 pb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider sf-text-muted">{group}</span>
            <span className="text-xs sf-text-muted">(&nbsp;)</span>
            <div className="flex-1 border-b sf-border-soft" />
          </div>
        </td>
      </tr>
      {UNIT_SKELETON_ROWS.map((row) => (
        <tr
          key={`${group}-${row}`}
          className="sf-border-soft border-t hover:sf-surface-hover cursor-pointer transition-colors"
          data-skeleton-row={`${group}-${row}`}
        >
          {UNIT_SKELETON_COLUMNS.map((column) => (
            <td
              key={`${group}-${row}-${column.id}`}
              className={column.id === 'actions' ? 'px-4 py-2.5 text-right' : 'px-4 py-2.5'}
            >
              <CellSkeleton columnId={column.id} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function TableSkeleton() {
  return (
    <div className="sf-surface rounded-lg sf-border-soft border overflow-hidden" data-region="unit-registry-loading-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="sf-surface-muted text-left">
            {UNIT_SKELETON_COLUMNS.map((column) => (
              <th key={column.id} className={column.className} data-skeleton-column={column.id}>
                {column.id === 'actions' ? null : <SkeletonBlock className="sf-skel-bar-label" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {UNIT_SKELETON_GROUPS.map((group) => (
            <GroupSkeleton key={group} group={group} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UnitRegistryPageSkeleton() {
  return (
    <div
      className="p-6 max-w-6xl mx-auto"
      data-testid="unit-registry-loading-skeleton"
      aria-busy="true"
    >
      <HeaderSkeleton />
      <TableSkeleton />
      <p className="text-xs sf-text-muted mt-4" data-region="unit-registry-loading-footer">
        The validator uses this registry for synonym resolution and unit conversion.
      </p>
    </div>
  );
}
