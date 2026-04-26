import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ExpandedState,
  type Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useState, useCallback, useEffect, useMemo, useRef, memo, Fragment, type ReactNode } from 'react';
import { resolvePersistedExpandMap, useTabStore } from '../../../stores/tabStore';

/** Opt-in fixed-height row virtualization. Mutually exclusive with `renderExpandedRow`. */
export interface DataTableVirtualizeOptions {
  /** Fixed pixel height per row. Caller is responsible for matching CSS. */
  rowHeight: number;
  /** Number of rows to render outside the viewport. Defaults to 8. */
  overscan?: number;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  searchable?: boolean;
  maxHeight?: string;
  persistKey?: string;
  onRowClick?: (row: T) => void;
  onCellClick?: (row: T, columnId: string, rowIndex: number) => void;
  getRowClassName?: (row: T) => string;
  /** When provided, rows become expandable. Return content for the expanded area, or null to hide. */
  renderExpandedRow?: (row: T) => ReactNode | null;
  /** Control which rows can expand. Defaults to all rows when renderExpandedRow is set. */
  getCanExpand?: (row: T) => boolean;
  /** Optional controlled sorting. When both are provided, internal sort state
   *  + persistence are bypassed so the parent owns the source of truth (used
   *  by surfaces that mix TanStack column sort with an external sort, e.g.
   *  the Overview Live header). */
  sorting?: SortingState;
  onSortingChange?: (next: SortingState) => void;
  /** Optional manual sorting mode for surfaces that sort data before passing it in. */
  manualSorting?: boolean;
  /** Optional header-click hook for custom sort cycles. */
  onColumnHeaderSort?: (columnId: string) => void;
  /**
   * Opt-in fixed-height row virtualization. Renders only the rows visible in
   * the viewport plus an overscan buffer; surrounding spacer rows preserve
   * scrollbar geometry.
   *
   * Requires fixed row height (caller's responsibility to match CSS).
   * Mutually exclusive with `renderExpandedRow` — combining them throws in
   * development to surface the conflict instead of silently breaking layout.
   */
  virtualize?: DataTableVirtualizeOptions;
}

interface PersistedDataTableState {
  sorting: SortingState;
  globalFilter: string;
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parseSorting(value: unknown): SortingState {
  if (!Array.isArray(value)) return [];
  return value.reduce<SortingState>((acc, entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return acc;
    const id = (entry as { id?: unknown }).id;
    const desc = (entry as { desc?: unknown }).desc;
    if (typeof id !== 'string' || id.length === 0) return acc;
    if (typeof desc !== 'boolean') return acc;
    acc.push({ id, desc });
    return acc;
  }, []);
}

function parseDataTableSessionState(raw: string | null): PersistedDataTableState {
  if (!raw) return { sorting: [], globalFilter: '' };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { sorting: [], globalFilter: '' };
    }
    return {
      sorting: parseSorting((parsed as { sorting?: unknown }).sorting),
      globalFilter: typeof (parsed as { globalFilter?: unknown }).globalFilter === 'string'
        ? (parsed as { globalFilter?: string }).globalFilter || ''
        : '',
    };
  } catch {
    return { sorting: [], globalFilter: '' };
  }
}

function readDataTableSessionState(persistKey?: string): PersistedDataTableState {
  if (!persistKey) return { sorting: [], globalFilter: '' };
  const local = getLocalStorage();
  if (local) {
    try {
      const raw = local.getItem(persistKey);
      if (raw) return parseDataTableSessionState(raw);
    } catch { /* fall through */ }
  }
  // WHY: Migrate legacy sessionStorage entries to localStorage.
  const session = getSessionStorage();
  if (session) {
    try {
      const legacy = session.getItem(persistKey);
      if (legacy) {
        local?.setItem(persistKey, legacy);
        session.removeItem(persistKey);
        return parseDataTableSessionState(legacy);
      }
    } catch { /* noop */ }
  }
  return { sorting: [], globalFilter: '' };
}

function writeDataTableSessionState(persistKey: string | undefined, state: PersistedDataTableState): void {
  if (!persistKey) return;
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(persistKey, JSON.stringify({
      sorting: parseSorting(state.sorting),
      globalFilter: typeof state.globalFilter === 'string' ? state.globalFilter : '',
    }));
  } catch {
    return;
  }
}

function DataTableInner<T>({
  data,
  columns,
  searchable = false,
  maxHeight = 'max-h-[calc(100vh-280px)]',
  persistKey,
  onRowClick,
  onCellClick,
  getRowClassName,
  renderExpandedRow,
  getCanExpand,
  sorting: controlledSorting,
  onSortingChange: controlledOnSortingChange,
  manualSorting = false,
  onColumnHeaderSort,
  virtualize,
}: DataTableProps<T>) {
  // WHY: Virtualization assumes fixed row height; expandable rows have
  // variable height. Combining them silently breaks scroll geometry. Surface
  // the conflict at dev time rather than ship a broken table.
  if (virtualize && renderExpandedRow) {
    throw new Error('DataTable: `virtualize` and `renderExpandedRow` are mutually exclusive — virtualization requires fixed row height.');
  }
  const initialSessionState = useMemo(
    () => readDataTableSessionState(persistKey),
    [persistKey],
  );
  const [internalSorting, setInternalSorting] = useState<SortingState>(initialSessionState.sorting);
  const isControlled = controlledSorting !== undefined && controlledOnSortingChange !== undefined;
  const sorting = isControlled ? controlledSorting : internalSorting;
  const setSorting = useCallback<(next: SortingState | ((prev: SortingState) => SortingState)) => void>(
    (next) => {
      if (isControlled) {
        const resolved = typeof next === 'function' ? (next as (p: SortingState) => SortingState)(controlledSorting!) : next;
        controlledOnSortingChange!(resolved);
      } else {
        setInternalSorting(next);
      }
    },
    [isControlled, controlledSorting, controlledOnSortingChange],
  );
  const [globalFilter, setGlobalFilter] = useState(initialSessionState.globalFilter);

  // WHY: Persist expanded-row state to the shared tab store so opening a row
  // survives tab-away / remount. Keyed as `${persistKey}:expanded` to avoid
  // colliding with the sorting/globalFilter entry stored at `persistKey`.
  const expandStorageKey = persistKey && renderExpandedRow
    ? `${persistKey}:expanded`
    : null;
  const [expanded, setExpanded] = useState<ExpandedState>(() => {
    if (!expandStorageKey) return {};
    const storedRaw = useTabStore.getState().values[expandStorageKey];
    return resolvePersistedExpandMap({ storedValue: storedRaw });
  });

  useEffect(() => {
    const next = readDataTableSessionState(persistKey);
    if (!isControlled) setSorting(next.sorting);
    setGlobalFilter(next.globalFilter);
  }, [persistKey, isControlled, setSorting]);

  useEffect(() => {
    // In controlled mode, the parent owns sort persistence — only persist
    // the globalFilter half so we don't write a stale sort entry that would
    // resurrect on next mount.
    writeDataTableSessionState(persistKey, {
      sorting: isControlled ? [] : sorting,
      globalFilter,
    });
  }, [persistKey, sorting, globalFilter, isControlled]);

  useEffect(() => {
    if (!expandStorageKey) return;
    const storedRaw = useTabStore.getState().values[expandStorageKey];
    setExpanded(resolvePersistedExpandMap({ storedValue: storedRaw }));
  }, [expandStorageKey]);

  useEffect(() => {
    if (!expandStorageKey) return;
    if (expanded === true) return;
    useTabStore.getState().set(expandStorageKey, JSON.stringify(expanded));
  }, [expandStorageKey, expanded]);

  const canExpandRow = useCallback(
    (row: Row<T>) => {
      if (!renderExpandedRow) return false;
      if (getCanExpand) return getCanExpand(row.original);
      return true;
    },
    [renderExpandedRow, getCanExpand],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, expanded },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onExpandedChange: setExpanded,
    getRowCanExpand: canExpandRow,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualSorting,
    ...(renderExpandedRow ? { getExpandedRowModel: getExpandedRowModel() } : {}),
  });

  const totalVisibleCols = typeof table?.getVisibleFlatColumns === 'function'
    ? table.getVisibleFlatColumns().length
    : columns.length;

  // WHY: Virtualizer needs the scroll container as its ref. Always create the
  // ref + virtualizer (even when virtualize is unset) so the hook order is
  // stable across renders; we just don't read its output unless virtualize is
  // active. count=0 keeps the off-path nearly free.
  const scrollRef = useRef<HTMLDivElement>(null);
  const allRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: virtualize ? allRows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => virtualize?.rowHeight ?? 0,
    overscan: virtualize?.overscan ?? 8,
  });
  const virtualItems = virtualize ? virtualizer.getVirtualItems() : [];
  const totalSize = virtualize ? virtualizer.getTotalSize() : 0;
  const paddingTop = virtualize && virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualize && virtualItems.length > 0
    ? totalSize - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <div>
      {searchable && (
        <input
          type="text"
          placeholder="Search..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="sf-input sf-primitive-input sf-table-search-input mb-2 w-full max-w-xs"
        />
      )}
      <div ref={scrollRef} className={`sf-table-shell sf-primitive-table-shell overflow-auto ${maxHeight}`}>
        <table className="min-w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {table.getVisibleFlatColumns().map((col) => {
              const w = col.columnDef.size;
              return <col key={col.id} style={w ? { width: w } : undefined} />;
            })}
          </colgroup>
          <thead className="sf-table-head sticky top-0">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  if (header.isPlaceholder) return null;
                  const colSize = header.column.columnDef.size;
                  const isGroupHeader = header.subHeaders.length > 0;
                  const canSort = !isGroupHeader && header.column.getCanSort();
                  const sortHandler = !canSort
                    ? undefined
                    : onColumnHeaderSort
                      ? () => onColumnHeaderSort(header.column.id)
                      : header.column.getToggleSortingHandler();
                  return (
                    <th
                      key={header.id}
                      colSpan={header.colSpan > 1 ? header.colSpan : undefined}
                      className={`sf-table-head-cell ${isGroupHeader ? 'text-center' : ''} ${canSort ? 'cursor-pointer select-none' : ''}`}
                      style={!isGroupHeader && colSize ? { width: colSize, minWidth: colSize } : undefined}
                      onClick={sortHandler}
                    >
                      <div className={`flex items-center gap-1 ${isGroupHeader ? 'justify-center' : ''}`}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {!isGroupHeader && ({ asc: ' \u25B2', desc: ' \u25BC' }[header.column.getIsSorted() as string] ?? '')}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-sf-border-default">
            {virtualize ? (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={totalVisibleCols} style={{ height: paddingTop, padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualItems.map((virtualRow) => {
                  const row = allRows[virtualRow.index];
                  return (
                    <tr
                      key={row.id}
                      className={`sf-table-row ${onRowClick || onCellClick ? 'cursor-pointer' : ''} ${getRowClassName?.(row.original) || ''}`}
                      style={{ height: virtualize.rowHeight }}
                      onClick={onCellClick ? undefined : () => onRowClick?.(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-2 py-1.5 whitespace-nowrap overflow-hidden"
                          onClick={onCellClick ? (e) => {
                            e.stopPropagation();
                            onCellClick(row.original, cell.column.id, row.index);
                          } : undefined}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={totalVisibleCols} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                  </tr>
                )}
              </>
            ) : (
              allRows.map((row) => {
                const isExpanded = row.getIsExpanded();
                const expandedContent = isExpanded && renderExpandedRow ? renderExpandedRow(row.original) : null;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`sf-table-row ${onRowClick || onCellClick ? 'cursor-pointer' : ''} ${getRowClassName?.(row.original) || ''}`}
                      onClick={onCellClick ? undefined : () => onRowClick?.(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-2 py-1.5 whitespace-nowrap overflow-hidden"
                          onClick={onCellClick ? (e) => {
                            e.stopPropagation();
                            onCellClick(row.original, cell.column.id, row.index);
                          } : undefined}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                    {expandedContent && (
                      <tr className="sf-table-expanded-row">
                        <td colSpan={totalVisibleCols} className="px-3 py-2">
                          {expandedContent}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
        {allRows.length === 0 && (
          <div className="sf-table-empty-state text-center py-8 text-sm">No data</div>
        )}
      </div>
    </div>
  );
}

// Memoize so parent re-renders (e.g. from store subscriptions) don't cascade
// through the entire table and cause editing inputs to lose focus.
export const DataTable = memo(DataTableInner) as typeof DataTableInner;
