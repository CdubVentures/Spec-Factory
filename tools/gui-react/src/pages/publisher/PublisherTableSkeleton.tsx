import { SkeletonBlock } from '../../shared/ui/feedback/SkeletonBlock.tsx';

interface PublisherSkeletonColumn {
  readonly id: string;
}

const PUBLISHER_TABLE_COLUMNS: readonly PublisherSkeletonColumn[] = [
  { id: 'expand' },
  { id: 'submitted_at' },
  { id: 'brand' },
  { id: 'model' },
  { id: 'product_id' },
  { id: 'field_key' },
  { id: 'value' },
  { id: 'status' },
  { id: 'unknown_stripped' },
  { id: 'published' },
  { id: 'confidence' },
  { id: 'source_type' },
  { id: 'repairs' },
  { id: 'evidence_accepted' },
  { id: 'evidence_rejected' },
];

const PUBLISHER_TABLE_ROWS = Array.from({ length: 10 }, (_value, index) => `row-${index}`);
const PUBLISHER_PAGE_BUTTONS = ['prev', '1', '2', '3', 'next'] as const;

const CHIP_COLUMNS = new Set([
  'status',
  'unknown_stripped',
  'published',
  'source_type',
]);
const NUMERIC_CHIP_COLUMNS = new Set(['repairs', 'evidence_accepted', 'evidence_rejected']);

function CellSkeleton({ columnId }: { readonly columnId: string }) {
  if (columnId === 'expand') {
    return <span className="sf-shimmer inline-block h-5 w-5 rounded-sm" aria-hidden="true" />;
  }
  if (columnId === 'submitted_at') {
    return <SkeletonBlock className="sf-skel-bar-label" />;
  }
  if (columnId === 'brand' || columnId === 'model' || columnId === 'product_id' || columnId === 'value') {
    return <SkeletonBlock className="sf-skel-bar" />;
  }
  if (columnId === 'field_key') {
    return <span className="sf-shimmer inline-block h-5 w-24 rounded-md" aria-hidden="true" />;
  }
  if (CHIP_COLUMNS.has(columnId)) {
    return <span className="sf-shimmer inline-block h-5 w-16 rounded-md" aria-hidden="true" />;
  }
  if (columnId === 'confidence') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="sf-shimmer inline-block h-1.5 w-10 rounded-full" aria-hidden="true" />
        <SkeletonBlock className="sf-skel-caption" />
      </div>
    );
  }
  if (NUMERIC_CHIP_COLUMNS.has(columnId)) {
    return <span className="sf-shimmer inline-block h-5 w-8 rounded-md" aria-hidden="true" />;
  }
  return <SkeletonBlock className="sf-skel-bar" />;
}

function TableSkeleton() {
  return (
    <div
      className="sf-table-shell sf-primitive-table-shell overflow-auto max-h-[calc(100vh-400px)]"
      data-region="publisher-loading-table"
    >
      <table className="min-w-full text-sm table-fixed" aria-hidden="true">
        <thead className="sf-table-head sticky top-0">
          <tr>
            {PUBLISHER_TABLE_COLUMNS.map((column) => (
              <th key={column.id} className="sf-table-head-cell cursor-pointer select-none" data-skeleton-column={column.id}>
                <div className="flex items-center gap-1">
                  <SkeletonBlock className="sf-skel-bar-label" />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sf-border-default">
          {PUBLISHER_TABLE_ROWS.map((row) => (
            <tr key={row} className="sf-table-row" data-skeleton-row={row}>
              {PUBLISHER_TABLE_COLUMNS.map((column) => (
                <td key={`${row}-${column.id}`} className="px-2 py-1.5 whitespace-nowrap overflow-hidden" data-skeleton-cell={column.id}>
                  <CellSkeleton columnId={column.id} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaginationSkeleton() {
  return (
    <div
      className="flex items-center justify-between sf-surface-panel rounded border sf-border-default px-4 py-2.5"
      data-region="publisher-loading-pagination"
    >
      <SkeletonBlock className="sf-skel-bar-label" />
      <div className="flex items-center gap-1">
        {PUBLISHER_PAGE_BUTTONS.map((button) => (
          <span
            key={button}
            className="sf-shimmer inline-block h-7 w-9 rounded-sm"
            data-skeleton-page-button={button}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}

export function PublisherTableSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="publisher-table-loading-skeleton" aria-busy="true">
      <TableSkeleton />
      <PaginationSkeleton />
    </div>
  );
}
