import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { btnPrimary, btnSecondary } from '../../../shared/ui/buttonClasses.ts';
import { inputCls, labelCls } from './studioConstants.ts';

interface BrandManagerSkeletonProps {
  readonly drawerOpen: boolean;
}

interface BrandSkeletonColumn {
  readonly id: string;
}

const borderPanelCls = 'sf-border-default';
const sectionCls = `sf-surface-card rounded border ${borderPanelCls} p-4`;
const textSubtleCls = 'sf-text-subtle';
const textMutedCls = 'sf-text-subtle';

const BRAND_TABLE_COLUMNS: readonly BrandSkeletonColumn[] = [
  { id: 'canonical_name' },
  { id: 'identifier' },
  { id: 'aliases' },
  { id: 'categories' },
  { id: 'website' },
];
const BRAND_TABLE_ROWS = Array.from({ length: 8 }, (_value, index) => `row-${index}`);
const BRAND_TAB_ROWS = ['all', 'mouse', 'keyboard', 'monitor'] as const;
const DRAWER_FIELDS = ['name', 'aliases', 'categories', 'website'] as const;

function CellSkeleton({ columnId }: { readonly columnId: string }) {
  if (columnId === 'canonical_name') {
    return <SkeletonBlock className="sf-skel-bar-label" />;
  }
  if (columnId === 'identifier') {
    return <span className="sf-shimmer inline-block h-3.5 w-16 rounded-sm" aria-hidden="true" />;
  }
  if (columnId === 'aliases' || columnId === 'categories') {
    return (
      <div className="flex flex-wrap gap-1">
        <span className="sf-shimmer inline-block h-5 w-14 rounded-full" aria-hidden="true" />
        <span className="sf-shimmer inline-block h-5 w-12 rounded-full" aria-hidden="true" />
      </div>
    );
  }
  if (columnId === 'website') {
    return <SkeletonBlock className="sf-skel-bar" />;
  }
  return <SkeletonBlock className="sf-skel-bar" />;
}

function HeaderSkeleton() {
  return (
    <div className={`${sectionCls} flex items-center justify-between`} data-region="brand-manager-loading-header">
      <div>
        <h3 className="text-sm font-semibold">Brand Registry</h3>
        <p className={`text-xs mt-0.5 ${textSubtleCls}`}>
          <SkeletonBlock className="sf-skel-caption" />
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" className={btnSecondary} data-region="brand-manager-loading-action" disabled>
          Bulk Paste
        </button>
        <button type="button" className={btnPrimary} data-region="brand-manager-loading-action" disabled>
          + Add Brand
        </button>
      </div>
    </div>
  );
}

function CategoryTabsSkeleton() {
  return (
    <nav className="flex flex-wrap gap-1 px-1 py-1 sf-tab-strip rounded" data-region="brand-manager-loading-tabs">
      {BRAND_TAB_ROWS.map((tab, index) => (
        <span
          key={tab}
          className={`sf-shimmer inline-block px-3 h-[28px] w-20 rounded${index === 0 ? ' sf-tab-item-active' : ''}`}
          aria-hidden="true"
          data-skeleton-tab={tab}
        />
      ))}
    </nav>
  );
}

function TableSkeleton() {
  return (
    <div className={sectionCls} data-region="brand-manager-loading-table-section">
      <input
        type="text"
        placeholder="Search..."
        disabled
        className="sf-shimmer sf-input sf-primitive-input sf-table-search-input mb-2 w-full max-w-xs"
        data-region="brand-manager-loading-search"
      />
      <div
        className="sf-table-shell sf-primitive-table-shell overflow-auto max-h-[calc(100vh-280px)]"
        data-region="brand-manager-loading-table"
      >
        <table className="min-w-full text-sm table-fixed" aria-hidden="true">
          <thead className="sf-table-head sticky top-0">
            <tr>
              {BRAND_TABLE_COLUMNS.map((column) => (
                <th key={column.id} className="sf-table-head-cell cursor-pointer select-none" data-skeleton-column={column.id}>
                  <div className="flex items-center gap-1">
                    <SkeletonBlock className="sf-skel-bar-label" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sf-border-default">
            {BRAND_TABLE_ROWS.map((row) => (
              <tr key={row} className="sf-table-row cursor-pointer" data-skeleton-row={row}>
                {BRAND_TABLE_COLUMNS.map((column) => (
                  <td key={`${row}-${column.id}`} className="px-2 py-1.5 whitespace-nowrap overflow-hidden" data-skeleton-cell={column.id}>
                    <CellSkeleton columnId={column.id} />
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

function DrawerFieldSkeleton({ field }: { readonly field: string }) {
  if (field === 'categories') {
    return (
      <div data-region="brand-manager-loading-drawer-field">
        <label className={labelCls}>Categories *</label>
        <div className="flex flex-wrap gap-1 mt-1">
          {BRAND_TAB_ROWS.slice(1).map((tab) => (
            <span
              key={tab}
              className="sf-shimmer inline-block px-3 h-[28px] w-20 rounded"
              aria-hidden="true"
              data-skeleton-tab={tab}
            />
          ))}
        </div>
      </div>
    );
  }

  const label = field === 'name' ? 'Brand Name *' : field === 'aliases' ? 'Aliases (comma-separated)' : 'Website';
  const type = field === 'website' ? 'url' : 'text';
  return (
    <div data-region="brand-manager-loading-drawer-field">
      <label className={labelCls}>{label}</label>
      <div className={`${inputCls} sf-shimmer w-full h-9`} aria-hidden="true" />
      {field === 'name' && (
        <div className="mt-1 space-y-0.5">
          <p className={`text-xs ${textMutedCls}`}><SkeletonBlock className="sf-skel-caption" /></p>
        </div>
      )}
      <input type={type} className="hidden" disabled />
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className={`${sectionCls} space-y-4 self-start sticky top-4`} data-region="brand-manager-loading-drawer">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Add Brand</h4>
        <button type="button" className={`${textMutedCls} hover:sf-text-muted text-lg leading-none`} disabled>
          &times;
        </button>
      </div>
      {DRAWER_FIELDS.map((field) => (
        <DrawerFieldSkeleton key={field} field={field} />
      ))}
      <div className="flex gap-2 pt-2 border-t sf-border-default">
        <button type="button" className={btnPrimary} data-region="brand-manager-loading-drawer-action" disabled>
          Save
        </button>
        <button type="button" className={btnSecondary} data-region="brand-manager-loading-drawer-action" disabled>
          Delete
        </button>
      </div>
    </div>
  );
}

export function BrandManagerSkeleton({ drawerOpen }: BrandManagerSkeletonProps) {
  return (
    <div
      className={`grid ${drawerOpen ? 'grid-cols-[1fr,400px]' : 'grid-cols-1'} gap-3`}
      data-testid="brand-manager-loading-skeleton"
      aria-busy="true"
    >
      <div className="space-y-3">
        <HeaderSkeleton />
        <CategoryTabsSkeleton />
        <TableSkeleton />
      </div>
      {drawerOpen && <DrawerSkeleton />}
    </div>
  );
}
