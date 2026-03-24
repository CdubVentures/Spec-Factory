import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { useUiStore } from '../../stores/uiStore.ts';
import { MetricRow } from '../../shared/ui/data-display/MetricRow.tsx';
import { ProgressBar } from '../../shared/ui/data-display/ProgressBar.tsx';
import { DataTable } from '../../shared/ui/data-display/DataTable.tsx';
import { StatusBadge } from '../../shared/ui/feedback/StatusBadge.tsx';
import { TrafficLight } from '../../shared/ui/feedback/TrafficLight.tsx';
import { Spinner } from '../../shared/ui/feedback/Spinner.tsx';
import { pct, usd, relativeTime } from '../../utils/formatting.ts';
import { useProductStore } from '../../stores/productStore.ts';
import type { CatalogRow } from '../../types/product.ts';
import { parseCatalogRows } from '../../features/catalog/api/catalogParsers.ts';
import type { ColumnDef } from '@tanstack/react-table';

const columns: ColumnDef<CatalogRow, unknown>[] = [
  { accessorKey: 'brand', header: 'Brand', size: 100 },
  { accessorKey: 'model', header: 'Model', size: 150 },
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
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
    size: 100,
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
    accessorKey: 'hasFinal',
    header: 'Final',
    cell: ({ getValue }) => (getValue() ? '\u2714' : ''),
    size: 50,
  },
  {
    accessorKey: 'validated',
    header: 'Valid',
    cell: ({ getValue }) => (getValue() ? '\u2714' : ''),
    size: 50,
  },
  {
    accessorKey: 'lastRun',
    header: 'Last Run',
    cell: ({ getValue }) => relativeTime(getValue() as string),
    size: 80,
  },
];

export function OverviewPage() {
  const category = useUiStore((s) => s.category);
  const setSelectedProduct = useProductStore((s) => s.setSelectedProduct);

  const { data: catalog = [], isLoading } = useQuery({
    queryKey: ['catalog', category],
    queryFn: () => api.parsedGet(`/catalog/${category}`, parseCatalogRows),
    refetchInterval: 10_000,
  });

  const { data: billing } = useQuery({
    queryKey: ['billing', category],
    queryFn: () => api.get<{ totals?: { cost_usd?: number; calls?: number } }>(`/billing/${category}/monthly`),
    refetchInterval: 30_000,
  });

  if (isLoading) return <Spinner className="h-8 w-8 mx-auto mt-12" />;

  const targets = catalog.filter((r) => r.inActive).length;
  const finals = catalog.filter((r) => r.hasFinal).length;
  const validated = catalog.filter((r) => r.hasFinal && r.validated).length;
  const coverageAvg = targets > 0 ? finals / targets : 0;
  const avgConf = catalog.length > 0
    ? catalog.reduce((sum, r) => sum + r.confidence, 0) / catalog.length
    : 0;
  const totals = billing?.totals || {};

  return (
    <div className="space-y-6 sf-text-primary">
      <MetricRow
        metrics={[
          { label: 'Products', value: catalog.length },
          { label: 'Active Targets', value: targets },
          { label: 'Finals', value: finals },
          { label: 'Validated', value: validated },
          { label: 'Avg Confidence', value: pct(avgConf) },
          { label: 'Monthly Cost', value: usd(totals.cost_usd || 0, 2) },
        ]}
      />

      <div className="sf-surface-card p-3">
        <ProgressBar value={coverageAvg} label="Overall Coverage" color="sf-meter-fill-success" />
      </div>

      <div className="sf-table-shell">
        <DataTable
          data={catalog}
          columns={columns}
          searchable
          persistKey={`overview:table:${category}`}
          maxHeight="max-h-[calc(100vh-340px)]"
          onRowClick={(row) => setSelectedProduct(row.productId, row.brand, row.model)}
        />
      </div>
    </div>
  );
}
