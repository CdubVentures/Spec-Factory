import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { sectionCls } from '../../../shared/ui/buttonClasses.ts';
import { PRODUCT_TABLE_COLUMNS } from './productTableColumns.tsx';

interface ProductManagerSkeletonProps {
  readonly category: string;
  readonly drawerOpen: boolean;
}

interface SkeletonColumn {
  readonly id: string;
}

const PRODUCT_SKELETON_ROWS = Array.from({ length: 10 }, (_value, index) => `row-${index}`);
const DRAWER_FIELD_ROWS = ['brand', 'base-model', 'variant', 'status'] as const;
const DRAWER_ACTIONS = ['primary', 'secondary'] as const;

function resolveColumnId(column: (typeof PRODUCT_TABLE_COLUMNS)[number], index: number): string {
  if ('accessorKey' in column && typeof column.accessorKey === 'string') {
    return column.accessorKey;
  }
  return `column-${index}`;
}

const PRODUCT_SKELETON_COLUMNS: readonly SkeletonColumn[] = PRODUCT_TABLE_COLUMNS.map((column, index) => ({
  id: resolveColumnId(column, index),
}));

function HeaderSkeleton({ category }: { readonly category: string }) {
  return (
    <div className={`${sectionCls} flex items-center justify-between`} data-region="catalog-loading-header">
      <div className="space-y-2">
        <SkeletonBlock className="sf-skel-title" />
        <SkeletonBlock className="sf-skel-caption" />
        <span className="sr-only">Loading product catalog for {category}</span>
      </div>
      <div className="flex gap-2">
        <div data-region="catalog-loading-action">
          <SkeletonBlock className="sf-skel-action" />
        </div>
        <div data-region="catalog-loading-action">
          <SkeletonBlock className="sf-skel-action" />
        </div>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className={sectionCls} data-region="catalog-loading-table">
      <div className="mb-2" data-region="catalog-loading-table-search">
        <SkeletonBlock className="sf-skel-input" />
      </div>
      <div className="sf-table-shell sf-primitive-table-shell overflow-hidden max-h-[calc(100vh-280px)]">
        <table className="min-w-full text-sm table-fixed" aria-hidden="true">
          <thead className="sf-table-head">
            <tr>
              {PRODUCT_SKELETON_COLUMNS.map((column) => (
                <th key={column.id} className="sf-table-head-cell" data-skeleton-column={column.id}>
                  <SkeletonBlock className="sf-skel-bar" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sf-border-default">
            {PRODUCT_SKELETON_ROWS.map((row) => (
              <tr key={row} className="sf-table-row" data-skeleton-row={row}>
                {PRODUCT_SKELETON_COLUMNS.map((column) => (
                  <td key={`${row}-${column.id}`} className="px-2 py-1.5" data-skeleton-cell={column.id}>
                    <SkeletonBlock className="sf-skel-bar" />
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

function DrawerSkeleton() {
  return (
    <div className={`${sectionCls} space-y-4 self-start sticky top-4`} data-region="catalog-loading-drawer">
      <div className="flex items-center justify-between">
        <SkeletonBlock className="sf-skel-title" />
        <SkeletonBlock className="sf-skel-icon-action" />
      </div>
      {DRAWER_FIELD_ROWS.map((field) => (
        <div key={field} className="space-y-1.5" data-region="catalog-loading-drawer-field">
          <SkeletonBlock className="sf-skel-caption" />
          <SkeletonBlock className="sf-skel-input" />
        </div>
      ))}
      <div className="sf-bg-surface-soft rounded p-2.5 border sf-border-default space-y-1.5">
        <SkeletonBlock className="sf-skel-caption" />
        <SkeletonBlock className="sf-skel-bar" />
        <SkeletonBlock className="sf-skel-bar" />
        <SkeletonBlock className="sf-skel-bar" />
      </div>
      <div className="flex gap-2 pt-2 border-t sf-border-default">
        {DRAWER_ACTIONS.map((action) => (
          <div key={action} data-region="catalog-loading-drawer-action">
            <SkeletonBlock className="sf-skel-action" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductManagerSkeleton({ category, drawerOpen }: ProductManagerSkeletonProps) {
  return (
    <div
      className={`grid ${drawerOpen ? 'grid-cols-[1fr,380px]' : 'grid-cols-1'} gap-3`}
      data-testid="catalog-product-loading-skeleton"
      aria-busy="true"
    >
      <div className="space-y-3">
        <HeaderSkeleton category={category} />
        <TableSkeleton />
      </div>
      {drawerOpen && <DrawerSkeleton />}
    </div>
  );
}
