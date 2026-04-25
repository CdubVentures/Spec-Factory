import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { useUiStore } from '../../stores/uiStore.ts';
import { MetricCard } from '../../shared/ui/data-display/MetricCard.tsx';
import { DataTable } from '../../shared/ui/data-display/DataTable.tsx';
import { TrafficLight } from '../../shared/ui/feedback/TrafficLight.tsx';
import { Spinner } from '../../shared/ui/feedback/Spinner.tsx';
import { pct } from '../../utils/formatting.ts';
import { useFormatDateYMD } from '../../utils/dateTime.ts';
import type { CatalogRow } from '../../types/product.ts';
import { parseCatalogRows } from '../../features/catalog/api/catalogParsers.ts';
import type { ColumnDef } from '@tanstack/react-table';
import type { ColorRegistryEntry } from '../../features/color-edition-finder/types.ts';
import { useRunningProductIds } from '../../features/operations/hooks/useFinderOperations.ts';
import { CefRunPopover } from './CefRunPopover.tsx';
import { PifVariantsCell } from './PifVariantsCell.tsx';
import { ScalarVariantsCell } from './ScalarVariantsCell.tsx';
import { KeyTierRings } from './KeyTierRings.tsx';
import { ScoreCardCell } from './ScoreCardCell.tsx';
import {
  OverviewFilterBar,
  type OverviewFilterState,
  type OverviewSortKey,
} from './OverviewFilterBar.tsx';
import { CommandConsole } from './CommandConsole.tsx';
import { SelectionStrip } from './SelectionStrip.tsx';
import {
  useOverviewSelectionStore,
  useIsSelected,
} from './overviewSelectionStore.ts';

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
  sortBy: 'default' as OverviewSortKey,
  activeFirst: false,
});

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

function compareBySort(a: CatalogRow, b: CatalogRow, sortBy: OverviewSortKey): number {
  switch (sortBy) {
    case 'confidence': return (b.confidence - a.confidence) || defaultCompare(a, b);
    case 'coverage':   return (b.coverage - a.coverage) || defaultCompare(a, b);
    case 'fields':     return (b.fieldsFilled - a.fieldsFilled) || defaultCompare(a, b);
    default:           return defaultCompare(a, b);
  }
}

function defaultCompare(a: CatalogRow, b: CatalogRow): number {
  return (
    a.brand.localeCompare(b.brand) ||
    a.base_model.localeCompare(b.base_model) ||
    a.variant.localeCompare(b.variant)
  );
}

function metricTrafficColor(ratio: number): 'green' | 'yellow' | 'red' | 'gray' {
  if (!Number.isFinite(ratio) || ratio <= 0) return 'gray';
  if (ratio >= 0.85) return 'green';
  if (ratio >= 0.6) return 'yellow';
  return 'red';
}

function MetricWithDot({ value, text }: { value: number; text: string }) {
  return (
    <span className="flex items-center gap-1">
      <TrafficLight color={metricTrafficColor(value)} />
      {text}
    </span>
  );
}

function buildColumns(
  hexMap: ReadonlyMap<string, string>,
  category: string,
  formatRdfValue: (value: string) => string,
): ColumnDef<CatalogRow, unknown>[] {
  return [
    {
      accessorKey: 'brand',
      header: 'Brand',
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
      header: 'CEF',
      size: 110,
      cell: ({ row }) => (
        <CefRunPopover
          productId={row.original.productId}
          category={category}
          filled={row.original.cefRunCount}
          total={CEF_REQUIRED_RUNS}
        />
      ),
    },
    {
      accessorKey: 'pifVariants',
      header: 'PIF',
      size: 414,
      cell: ({ row }) => (
        <PifVariantsCell
          productId={row.original.productId}
          category={category}
          variants={row.original.pifVariants}
          hexMap={hexMap}
        />
      ),
    },
    {
      accessorKey: 'skuVariants',
      header: 'SKU',
      size: 376,
      cell: ({ row }) => (
        <ScalarVariantsCell
          productId={row.original.productId}
          category={category}
          variants={row.original.skuVariants}
          hexMap={hexMap}
          moduleType="skf"
          phaseId="skuFinder"
          title="SKU Finder"
          labelPrefix="SKU"
          runUrl={`/sku-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.original.productId)}`}
          valueLabel="SKU"
        />
      ),
    },
    {
      accessorKey: 'rdfVariants',
      header: 'RDF',
      size: 376,
      cell: ({ row }) => (
        <ScalarVariantsCell
          productId={row.original.productId}
          category={category}
          variants={row.original.rdfVariants}
          hexMap={hexMap}
          moduleType="rdf"
          phaseId="releaseDateFinder"
          title="Release Date Finder"
          labelPrefix="RDF"
          runUrl={`/release-date-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.original.productId)}`}
          valueLabel="Release Date"
          formatLabel={formatRdfValue}
          formatValue={formatRdfValue}
        />
      ),
    },
    {
      id: 'key',
      header: 'Keys',
      size: 280,
      cell: ({ row }) => (
        <KeyTierRings
          productId={row.original.productId}
          category={category}
          tiers={row.original.keyTierProgress}
        />
      ),
    },
    {
      id: 'scoreCard',
      header: 'Score',
      size: 70,
      cell: ({ row }) => <ScoreCardCell row={row.original} />,
    },
    {
      accessorKey: 'coverage',
      header: 'Coverage',
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return <MetricWithDot value={v} text={pct(v)} />;
      },
      size: 95,
    },
    {
      accessorKey: 'confidence',
      header: 'Conf',
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return <MetricWithDot value={v} text={pct(v)} />;
      },
      size: 95,
    },
    {
      accessorKey: 'fieldsFilled',
      header: 'Fields',
      cell: ({ row }) => {
        const filled = row.original.fieldsFilled;
        const total = row.original.fieldsTotal;
        const ratio = total > 0 ? filled / total : 0;
        return <MetricWithDot value={ratio} text={`${filled}/${total}`} />;
      },
      size: 95,
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
    refetchInterval: 10_000,
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
  const runningProductIds = useRunningProductIds(category);

  const visibleRows = useMemo(() => {
    const filtered = catalog.filter((r) => matchesSearch(r, filterState.search));
    const { sortBy, activeFirst } = filterState;
    const sorted = filtered.slice().sort((a, b) => {
      if (activeFirst) {
        const aActive = runningProductIds.has(a.productId) ? 1 : 0;
        const bActive = runningProductIds.has(b.productId) ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
      }
      return compareBySort(a, b, sortBy);
    });
    return sorted;
  }, [catalog, filterState, runningProductIds]);

  const visibleIds = useMemo<readonly string[]>(
    () => visibleRows.map((r) => r.productId),
    [visibleRows],
  );

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
      ...buildColumns(hexMap, category, formatRdfValue),
    ],
    [hexMap, category, visibleIds, formatRdfValue],
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

      <SelectionStrip category={category} allRows={catalog} />

      <OverviewFilterBar
        state={filterState}
        onChange={setFilterState}
        shown={visibleRows.length}
        total={catalog.length}
        runningCount={runningProductIds.size}
      />

      <div className="sf-table-shell">
        <DataTable
          data={visibleRows}
          columns={columns}
          persistKey={`overview:table:${category}`}
          maxHeight="max-h-[calc(100vh-340px)]"
        />
      </div>
    </div>
  );
}
