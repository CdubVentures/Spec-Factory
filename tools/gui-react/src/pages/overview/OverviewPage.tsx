import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { useUiStore } from '../../stores/uiStore.ts';
import { MetricCard } from '../../shared/ui/data-display/MetricCard.tsx';
import { DataTable } from '../../shared/ui/data-display/DataTable.tsx';
import { MiniGauge } from '../../shared/ui/data-display/MiniGauge.tsx';
import { Spinner } from '../../shared/ui/feedback/Spinner.tsx';
import { pct } from '../../utils/formatting.ts';
import { useFormatDateYMD } from '../../utils/dateTime.ts';
import type { CatalogRow } from '../../types/product.ts';
import { parseCatalogRows } from '../../features/catalog/api/catalogParsers.ts';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { ColorRegistryEntry } from '../../features/color-edition-finder/types.ts';
import { CefRunPopover } from './CefRunPopover.tsx';
import { PifVariantsCell } from './PifVariantsCell.tsx';
import { ScalarVariantsCell } from './ScalarVariantsCell.tsx';
import { KeyTierRings } from './KeyTierRings.tsx';
import { ScoreCardCell } from './ScoreCardCell.tsx';
import {
  OverviewFilterBar,
  type OverviewFilterState,
} from './OverviewFilterBar.tsx';
import { CommandConsole } from './CommandConsole.tsx';
import { ActiveAndSelectedRow } from './ActiveAndSelectedRow.tsx';
import { OverviewLastRunCell, OverviewLastRunHeaderToggle } from './OverviewLastRunCell.tsx';
import { LiveOpsCell } from './LiveOpsCell.tsx';
import { useRunningModulesByProductOrdered } from '../../features/operations/hooks/useFinderOperations.ts';
import {
  getOverviewLastRunMs,
  readOverviewSortSessionState,
  sortOverviewRows,
  toggleOverviewSortStack,
  writeOverviewSortSessionState,
} from './overviewSort.ts';
import { usePersistedToggle } from '../../stores/collapseStore.ts';
import {
  useOverviewSelectionStore,
  useIsSelected,
} from './overviewSelectionStore.ts';
import {
  useColumnFilterStore,
  selectFilterState,
} from './columnFilters/columnFilterStore.ts';
import { matchesColumnFilters } from './columnFilters/columnFilterPredicates.ts';
import { ColumnFiltersStatusPill } from './columnFilters/ColumnFiltersStatusPill.tsx';
import { ColumnFilterHeader } from './columnFilters/ColumnFilterHeader.tsx';
import { BrandFilter } from './columnFilters/filters/BrandFilter.tsx';
import { CefFilter } from './columnFilters/filters/CefFilter.tsx';
import { ScoreFilter } from './columnFilters/filters/ScoreFilter.tsx';
import { NumericRangeFilter } from './columnFilters/filters/NumericRangeFilter.tsx';
import { VariantMetricFilter } from './columnFilters/filters/VariantMetricFilter.tsx';
import { ScalarVariantFilter } from './columnFilters/filters/ScalarVariantFilter.tsx';
import { KeysFilter } from './columnFilters/filters/KeysFilter.tsx';

function SelectHeaderCell({ category, visibleIds }: { category: string; visibleIds: readonly string[] }) {
  const selectedSet = useOverviewSelectionStore((s) => s.byCategory[category]);
  const addMany = useOverviewSelectionStore((s) => s.addMany);
  const toggle = useOverviewSelectionStore((s) => s.toggle);

  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet?.has(id));
  const someSelected = !allSelected && visibleIds.some((id) => selectedSet?.has(id));

  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected;
  }, [someSelected]);

  const onToggle = () => {
    if (allSelected) {
      for (const id of visibleIds) toggle(category, id);
    } else {
      addMany(category, visibleIds);
    }
  };

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={onToggle}
      aria-label={allSelected ? 'Deselect all visible' : 'Select all visible'}
      className="cursor-pointer"
    />
  );
}

function SelectCell({ category, productId }: { category: string; productId: string }) {
  const isSelected = useIsSelected(category, productId);
  const toggle = useOverviewSelectionStore((s) => s.toggle);
  return (
    <input
      type="checkbox"
      checked={isSelected}
      onChange={() => toggle(category, productId)}
      onClick={(e) => e.stopPropagation()}
      aria-label={isSelected ? 'Deselect product' : 'Select product'}
      className="cursor-pointer"
    />
  );
}

// WHY: CEF mandatory-run bar — 2 runs required before the downstream header-control
// module will let a product advance. Visual today, enforcement later.
const CEF_REQUIRED_RUNS = 2;


const INITIAL_FILTER_STATE: OverviewFilterState = Object.freeze({
  search: '',
});

interface OverviewSortViewState {
  category: string;
  sorting: SortingState;
}

function matchesSearch(row: CatalogRow, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.brand.toLowerCase().includes(q) ||
    row.model.toLowerCase().includes(q) ||
    row.base_model.toLowerCase().includes(q) ||
    row.variant.toLowerCase().includes(q) ||
    row.identifier.toLowerCase().includes(q) ||
    String(row.id).includes(q)
  );
}

function metricTrafficColor(ratio: number): 'green' | 'yellow' | 'red' | 'gray' {
  if (!Number.isFinite(ratio) || ratio <= 0) return 'gray';
  if (ratio >= 0.85) return 'green';
  if (ratio >= 0.6) return 'yellow';
  return 'red';
}

function buildColumns(
  hexMap: ReadonlyMap<string, string>,
  category: string,
  catalog: readonly CatalogRow[],
  formatRdfValue: (value: string) => string,
  detailColsOpen: boolean,
  toggleDetailCols: () => void,
  runningByProduct: ReadonlyMap<string, readonly string[]>,
): ColumnDef<CatalogRow, unknown>[] {
  // WHY: Overview owns one explicit Excel-style sort stack. Accessors on
  // display columns only mark those headers sortable; rows are ordered by
  // overviewSort.ts before DataTable renders them.
  return [
    {
      accessorKey: 'brand',
      header: () => (
        <ColumnFilterHeader category={category} filterKey="brand" label="Brand">
          <BrandFilter category={category} catalog={catalog} />
        </ColumnFilterHeader>
      ),
      size: 120,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? <span className="text-xs">{v}</span> : <span className="sf-text-subtle text-xs italic">—</span>;
      },
    },
    {
      accessorKey: 'base_model',
      header: 'Base Model',
      size: 180,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? <span className="text-xs">{v}</span> : <span className="sf-text-subtle text-xs italic">—</span>;
      },
    },
    {
      accessorKey: 'variant',
      header: 'Variant',
      size: 180,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? <span className="text-xs">{v}</span> : <span className="sf-text-subtle text-xs italic">—</span>;
      },
    },
    {
      id: 'gap',
      size: 40,
      enableSorting: false,
      header: () => null,
      cell: () => null,
    },
    {
      accessorKey: 'cefRunCount',
      header: () => (
        <ColumnFilterHeader category={category} filterKey="cef" label="CEF">
          <CefFilter category={category} />
        </ColumnFilterHeader>
      ),
      size: 110,
      cell: ({ row }) => (
        <CefRunPopover
          productId={row.original.productId}
          category={category}
          filled={row.original.cefRunCount}
          total={CEF_REQUIRED_RUNS}
          brand={row.original.brand}
          baseModel={row.original.base_model}
        />
      ),
    },
    {
      accessorKey: 'pifVariants',
      header: () => (
        <ColumnFilterHeader category={category} filterKey="pif" label="PIF">
          <VariantMetricFilter category={category} />
        </ColumnFilterHeader>
      ),
      size: 414,
      cell: ({ row }) => (
        <PifVariantsCell
          productId={row.original.productId}
          category={category}
          variants={row.original.pifVariants}
          hexMap={hexMap}
          brand={row.original.brand}
          baseModel={row.original.base_model}
        />
      ),
    },
    {
      accessorKey: 'rdfVariants',
      header: () => (
        <ColumnFilterHeader category={category} filterKey="rdf" label="RDF">
          <ScalarVariantFilter category={category} filterKey="rdf" />
        </ColumnFilterHeader>
      ),
      size: 376,
      cell: ({ row }) => (
        <ScalarVariantsCell
          productId={row.original.productId}
          category={category}
          variants={row.original.rdfVariants}
          hexMap={hexMap}
          moduleType="rdf"
          finderId="rdf"
          historyFinderId="releaseDateFinder"
          historyRoutePrefix="release-date-finder"
          phaseId="releaseDateFinder"
          title="Release Date Finder"
          labelPrefix="RDF"
          runUrl={`/release-date-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.original.productId)}`}
          valueLabel="Release Date"
          formatLabel={formatRdfValue}
          formatValue={formatRdfValue}
          linkTabId="releaseDateFinder"
          brand={row.original.brand}
          baseModel={row.original.base_model}
        />
      ),
    },
    {
      accessorKey: 'skuVariants',
      header: () => (
        <ColumnFilterHeader category={category} filterKey="sku" label="SKU">
          <ScalarVariantFilter category={category} filterKey="sku" />
        </ColumnFilterHeader>
      ),
      size: 376,
      cell: ({ row }) => (
        <ScalarVariantsCell
          productId={row.original.productId}
          category={category}
          variants={row.original.skuVariants}
          hexMap={hexMap}
          moduleType="skf"
          finderId="sku"
          historyFinderId="skuFinder"
          historyRoutePrefix="sku-finder"
          phaseId="skuFinder"
          title="SKU Finder"
          labelPrefix="SKU"
          runUrl={`/sku-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.original.productId)}`}
          valueLabel="SKU"
          linkTabId="skuFinder"
          brand={row.original.brand}
          baseModel={row.original.base_model}
        />
      ),
    },
    {
      id: 'key',
      accessorFn: (row) => row.keyTierProgress,
      header: () => (
        <ColumnFilterHeader category={category} filterKey="keys" label="Keys">
          <KeysFilter category={category} />
        </ColumnFilterHeader>
      ),
      size: 280,
      cell: ({ row }) => (
        <KeyTierRings
          productId={row.original.productId}
          category={category}
          tiers={row.original.keyTierProgress}
          brand={row.original.brand}
          baseModel={row.original.base_model}
        />
      ),
    },
    {
      id: 'scoreCard',
      accessorFn: (row) => row.productId,
      header: () => (
        <ColumnFilterHeader category={category} filterKey="score" label="Score">
          <ScoreFilter category={category} />
        </ColumnFilterHeader>
      ),
      size: 70,
      cell: ({ row }) => <ScoreCardCell row={row.original} />,
    },
    {
      accessorKey: 'coverage',
      header: () => (
        <ColumnFilterHeader category={category} filterKey="coverage" label="Coverage">
          <NumericRangeFilter category={category} filterKey="coverage" label="Coverage" unit="percent" />
        </ColumnFilterHeader>
      ),
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return <MiniGauge ratio={v} tone={metricTrafficColor(v)} label={pct(v)} />;
      },
      size: 95,
    },
    {
      accessorKey: 'confidence',
      header: () => (
        <ColumnFilterHeader category={category} filterKey="confidence" label="Conf">
          <NumericRangeFilter category={category} filterKey="confidence" label="Confidence" unit="percent" />
        </ColumnFilterHeader>
      ),
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return <MiniGauge ratio={v} tone={metricTrafficColor(v)} label={pct(v)} />;
      },
      size: 95,
    },
    {
      accessorKey: 'fieldsFilled',
      header: () => (
        <ColumnFilterHeader category={category} filterKey="fields" label="Fields">
          <NumericRangeFilter category={category} filterKey="fields" label="Fields filled" unit="count" />
        </ColumnFilterHeader>
      ),
      cell: ({ row }) => {
        const filled = row.original.fieldsFilled;
        const total = row.original.fieldsTotal;
        const ratio = total > 0 ? filled / total : 0;
        return <MiniGauge ratio={ratio} tone={metricTrafficColor(ratio)} label={`${filled}/${total}`} />;
      },
      size: 95,
    },
    {
      id: 'live',
      accessorFn: (row) => runningByProduct.get(row.productId)?.length ?? 0,
      header: () => (
        <span className="sf-cfh-row sf-cfh-row--left">
          <span className="sf-cfh-label">Live</span>
        </span>
      ),
      size: 90,
      cell: ({ row }) => (
        <LiveOpsCell category={category} productId={row.original.productId} />
      ),
    },
    {
      id: 'lastRun',
      accessorFn: (row) => getOverviewLastRunMs(row),
      size: detailColsOpen ? 200 : 112,
      header: () => (
        <span className="sf-cfh-row sf-cfh-row--left">
          <span className="sf-cfh-label">Last Run</span>
          <OverviewLastRunHeaderToggle open={detailColsOpen} onToggle={toggleDetailCols} />
        </span>
      ),
      cell: ({ row }) => (detailColsOpen
        ? <OverviewLastRunCell row={row.original} />
        : null
      ),
    },
  ];
}

export function OverviewPage() {
  const category = useUiStore((s) => s.category);
  const formatDateYMD = useFormatDateYMD();
  const formatRdfValue = useCallback(
    (value: string) => formatDateYMD(value) || value,
    [formatDateYMD],
  );

  const { data: catalog = [], isLoading } = useQuery({
    queryKey: ['catalog', category],
    queryFn: () => api.parsedGet(`/catalog/${category}`, parseCatalogRows),
  });

  const { data: colorRegistry = [] } = useQuery<ColorRegistryEntry[]>({
    queryKey: ['colors'],
    queryFn: () => api.get<ColorRegistryEntry[]>('/colors'),
  });

  const hexMap = useMemo<ReadonlyMap<string, string>>(
    () => new Map(colorRegistry.map((c) => [c.name, c.hex])),
    [colorRegistry],
  );

  const [filterState, setFilterState] = useState<OverviewFilterState>(INITIAL_FILTER_STATE);
  // WHY: Single shared toggle drives both detail columns (Links + Last Run)
  // so they slide open/closed together — clicking either chevron flips both.
  const [detailColsOpen, toggleDetailCols] = usePersistedToggle('overview:detail-cols:open', false);

  const [overviewSortState, setOverviewSortState] = useState<OverviewSortViewState>(() => ({
    category,
    sorting: readOverviewSortSessionState(category),
  }));
  const tableSorting = overviewSortState.category === category
    ? overviewSortState.sorting
    : [];
  useEffect(() => {
    setOverviewSortState((current) => {
      if (current.category === category) return current;
      return {
        category,
        sorting: readOverviewSortSessionState(category),
      };
    });
  }, [category]);
  useEffect(() => {
    if (overviewSortState.category !== category) return;
    writeOverviewSortSessionState(category, overviewSortState.sorting);
  }, [category, overviewSortState]);
  const handleColumnHeaderSort = useCallback((columnId: string) => {
    setOverviewSortState((current) => {
      const currentSorting = current.category === category
        ? current.sorting
        : readOverviewSortSessionState(category);
      return {
        category,
        sorting: toggleOverviewSortStack(currentSorting, columnId),
      };
    });
  }, [category]);
  const handleTableSortingChange = useCallback((next: SortingState) => {
    setOverviewSortState({ category, sorting: next });
  }, [category]);

  const columnFilters = useColumnFilterStore(selectFilterState(category));
  const runningByProduct = useRunningModulesByProductOrdered(category);

  const visibleRows = useMemo(() => {
    const filtered = catalog
      .filter((r) => matchesSearch(r, filterState.search))
      .filter((r) => matchesColumnFilters(r, columnFilters));
    return sortOverviewRows(filtered, tableSorting, runningByProduct);
  }, [catalog, filterState.search, columnFilters, tableSorting, runningByProduct]);

  const visibleIds = useMemo<readonly string[]>(
    () => visibleRows.map((r) => r.productId),
    [visibleRows],
  );

  const handleFilterChange = useCallback((next: OverviewFilterState) => {
    setFilterState(next);
  }, []);

  const columns = useMemo<ColumnDef<CatalogRow, unknown>[]>(
    () => [
      {
        id: 'select',
        size: 48,
        header: () => (
          <div className="flex w-full items-center justify-center">
            <SelectHeaderCell category={category} visibleIds={visibleIds} />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex w-full items-center justify-center">
            <SelectCell category={category} productId={row.original.productId} />
          </div>
        ),
      },
      ...buildColumns(hexMap, category, catalog, formatRdfValue, detailColsOpen, toggleDetailCols, runningByProduct),
    ],
    [hexMap, category, catalog, visibleIds, formatRdfValue, detailColsOpen, toggleDetailCols, runningByProduct],
  );

  if (isLoading) return <Spinner className="h-8 w-8 mx-auto mt-12" />;

  const avgConf = catalog.length > 0
    ? catalog.reduce((sum, r) => sum + r.confidence, 0) / catalog.length
    : 0;
  const keysResolved = catalog.reduce((sum, r) => sum + r.fieldsFilled, 0);
  const keysTotal = catalog.reduce((sum, r) => sum + r.fieldsTotal, 0);

  return (
    <div className="space-y-6 sf-text-primary">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="Products" value={catalog.length} />
          <MetricCard label="Avg Confidence" value={pct(avgConf)} />
          <MetricCard label="Keys Resolved" value={`${keysResolved}/${keysTotal}`} />
        </div>
        <CommandConsole category={category} allRows={catalog} />
      </div>

      <ActiveAndSelectedRow category={category} allRows={catalog} />

      <div>
        <OverviewFilterBar
          state={filterState}
          onChange={handleFilterChange}
          shown={visibleRows.length}
          total={catalog.length}
        />
        <div className="flex justify-end empty:hidden">
          <ColumnFiltersStatusPill category={category} />
        </div>
      </div>

      <div className="sf-table-shell">
        <DataTable
          data={visibleRows}
          columns={columns}
          persistKey={`overview:table:${category}`}
          maxHeight="max-h-[calc(100vh-340px)]"
          sorting={tableSorting}
          onSortingChange={handleTableSortingChange}
          manualSorting
          onColumnHeaderSort={handleColumnHeaderSort}
        />
      </div>
    </div>
  );
}
