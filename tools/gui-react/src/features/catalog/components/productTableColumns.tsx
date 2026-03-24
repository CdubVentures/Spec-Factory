import type { ColumnDef } from '@tanstack/react-table';
import type { CatalogProduct } from '../../../types/product.ts';

export const PRODUCT_TABLE_COLUMNS: ColumnDef<CatalogProduct, unknown>[] = [
  {
    accessorKey: 'brand',
    header: 'Brand',
    cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span>,
    size: 120,
  },
  {
    accessorKey: 'model',
    header: 'Model',
    size: 200,
  },
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
    cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as number}</span>,
  },
  {
    accessorKey: 'identifier',
    header: 'Identifier',
    size: 90,
    cell: ({ getValue }) => {
      const v = getValue() as string;
      return v ? <span className="font-mono text-xs" title={v}>{v.length > 6 ? v.slice(0, 6) + '...' : v}</span> : <span className="sf-text-subtle text-xs italic">—</span>;
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as string;
      const cls = s === 'active'
        ? 'sf-bg-surface-soft-strong sf-bg-surface-soft sf-status-text-success sf-status-text-success'
        : 'sf-bg-surface-soft-strong sf-bg-surface-soft-strong sf-text-muted sf-text-subtle';
      return <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${cls}`}>{s}</span>;
    },
    size: 80,
  },
  {
    accessorKey: 'seed_urls',
    header: 'URLs',
    cell: ({ getValue }) => {
      const urls = getValue() as string[];
      return <span className="text-xs sf-text-muted">{urls?.length || 0}</span>;
    },
    size: 50,
  },
];
