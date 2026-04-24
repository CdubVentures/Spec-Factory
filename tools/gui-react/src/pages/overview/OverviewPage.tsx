import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { useUiStore } from '../../stores/uiStore.ts';
import { MetricRow } from '../../shared/ui/data-display/MetricRow.tsx';
import { DataTable } from '../../shared/ui/data-display/DataTable.tsx';
import { TrafficLight } from '../../shared/ui/feedback/TrafficLight.tsx';
import { Spinner } from '../../shared/ui/feedback/Spinner.tsx';
import { pct } from '../../utils/formatting.ts';
import type { CatalogRow } from '../../types/product.ts';
import { parseCatalogRows } from '../../features/catalog/api/catalogParsers.ts';
import type { ColumnDef } from '@tanstack/react-table';
import type { ColorRegistryEntry } from '../../features/color-edition-finder/types.ts';
import { FinderRunDiamonds } from './FinderRunDiamonds.tsx';
import { PifVariantsCell } from './PifVariantsCell.tsx';
import { ScalarVariantsCell } from './ScalarVariantsCell.tsx';

// RDF values are ISO dates (e.g. "2024-03-15"); keep YYYY-MM in the label —
// enough context at a glance, full date in the tooltip.
function formatRdfLabel(value: string): string {
  if (!value) return '';
  return value.length >= 7 ? value.slice(0, 7) : value;
}

// WHY: CEF mandatory-run bar — 2 runs required before the downstream header-control
// module will let a product advance. Visual today, enforcement later.
const CEF_REQUIRED_RUNS = 2;

const placeholderCell = () => <span className="sf-text-subtle text-xs italic">—</span>;

function buildColumns(hexMap: ReadonlyMap<string, string>): ColumnDef<CatalogRow, unknown>[] {
  return [
    { accessorKey: 'brand', header: 'Brand', size: 100 },
    { accessorKey: 'model', header: 'Model', size: 150 },
    { accessorKey: 'base_model', header: 'Base Model', size: 130 },
    {
      accessorKey: 'variant',
      header: 'Variant',
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? <span className="text-xs">{v}</span> : <span className="sf-text-subtle text-xs italic">—</span>;
      },
      size: 100,
    },
    {
      accessorKey: 'id',
      header: 'ID#',
      size: 55,
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return v ? <span className="font-mono text-xs">{v}</span> : null;
      },
    },
    {
      accessorKey: 'identifier',
      header: 'Identifier',
      size: 90,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? <span className="font-mono text-xs" title={v}>{v.length > 6 ? v.slice(0, 6) + '...' : v}</span> : null;
      },
    },
    {
      accessorKey: 'confidence',
      header: 'Conf',
      cell: ({ getValue }) => {
        const v = getValue() as number;
        const color = v >= 0.85 ? 'green' : v >= 0.6 ? 'yellow' : v > 0 ? 'red' : 'gray';
        return (
          <span className="flex items-center gap-1">
            <TrafficLight color={color} />
            {pct(v)}
          </span>
        );
      },
      size: 80,
    },
    {
      accessorKey: 'coverage',
      header: 'Coverage',
      cell: ({ getValue }) => pct(getValue() as number),
      size: 80,
    },
    {
      accessorKey: 'fieldsFilled',
      header: 'Fields',
      cell: ({ row }) => `${row.original.fieldsFilled}/${row.original.fieldsTotal}`,
      size: 70,
    },
    {
      id: 'finders',
      header: 'Finders',
      columns: [
        {
          accessorKey: 'cefRunCount',
          header: 'CEF',
          size: 130,
          cell: ({ row }) => (
            <FinderRunDiamonds
              filled={row.original.cefRunCount}
              total={CEF_REQUIRED_RUNS}
            />
          ),
        },
        {
          accessorKey: 'pifVariants',
          header: 'PIF',
          size: 260,
          cell: ({ row }) => (
            <PifVariantsCell
              variants={row.original.pifVariants}
              hexMap={hexMap}
            />
          ),
        },
        {
          accessorKey: 'skuVariants',
          header: 'SKU',
          size: 220,
          cell: ({ row }) => (
            <ScalarVariantsCell
              variants={row.original.skuVariants}
              hexMap={hexMap}
              valueLabel="SKU"
            />
          ),
        },
        {
          accessorKey: 'rdfVariants',
          header: 'RDF',
          size: 200,
          cell: ({ row }) => (
            <ScalarVariantsCell
              variants={row.original.rdfVariants}
              hexMap={hexMap}
              valueLabel="Release Date"
              formatLabel={formatRdfLabel}
            />
          ),
        },
        { id: 'key', header: 'Keys', size: 70, cell: placeholderCell },
      ],
    },
  ];
}

export function OverviewPage() {
  const category = useUiStore((s) => s.category);

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

  const columns = useMemo(() => buildColumns(hexMap), [hexMap]);

  if (isLoading) return <Spinner className="h-8 w-8 mx-auto mt-12" />;

  const avgConf = catalog.length > 0
    ? catalog.reduce((sum, r) => sum + r.confidence, 0) / catalog.length
    : 0;
  const keysResolved = catalog.reduce((sum, r) => sum + r.fieldsFilled, 0);
  const keysTotal = catalog.reduce((sum, r) => sum + r.fieldsTotal, 0);

  return (
    <div className="space-y-6 sf-text-primary">
      <MetricRow
        metrics={[
          { label: 'Products', value: catalog.length },
          { label: 'Avg Confidence', value: pct(avgConf) },
          { label: 'Keys Resolved', value: `${keysResolved}/${keysTotal}` },
        ]}
      />

      <div className="sf-table-shell">
        <DataTable
          data={catalog}
          columns={columns}
          searchable
          persistKey={`overview:table:${category}`}
          maxHeight="max-h-[calc(100vh-340px)]"
        />
      </div>
    </div>
  );
}
