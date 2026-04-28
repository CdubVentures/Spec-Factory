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

function CellSkeleton({ columnId }: { readonly columnId: string }) {
  if (['status', 'unknown_stripped', 'published', 'source_type', 'repairs', 'evidence_accepted', 'evidence_rejected'].includes(columnId)) {
    return (
      <span className="sf-chip-neutral">
        <SkeletonBlock className="sf-skel-caption" />
      </span>
    );
  }
  if (columnId === 'expand') {
    return <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm"><SkeletonBlock className="sf-skel-icon-action" /></span>;
  }
  if (columnId === 'confidence') {
    return (
      <div className="flex items-center gap-1.5">
        <div className="rounded-full overflow-hidden sf-bg-surface-soft-strong w-[22px] h-[5px]">
          <div className="h-full rounded-full sf-bg-accent w-1/2" />
        </div>
        <SkeletonBlock className="sf-skel-caption" />
      </div>
    );
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
                  <SkeletonBlock className="sf-skel-bar" />
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
      <span className="sf-text-subtle text-[11px]">
        <SkeletonBlock className="sf-skel-caption" />
      </span>
      <div className="flex items-center gap-1">
        {PUBLISHER_PAGE_BUTTONS.map((button) => (
          <button
            key={button}
            type="button"
            className="px-2.5 py-1 rounded-sm text-xs font-semibold border sf-border-default sf-surface-elevated sf-text-muted disabled:opacity-30 cursor-pointer"
            disabled
          >
            <SkeletonBlock className="sf-skel-caption" />
          </button>
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
