import { useMemo } from 'react';
import { DataTable } from '@/shared/ui/data-display/DataTable';
import type { ProductGroup } from '../../helpers.ts';
import { buildProductColumns } from '../columns/productTableColumns.tsx';
import { RunSubTable } from './RunSubTable.tsx';

interface ProductTableProps {
  products: ProductGroup[];
  isLoading: boolean;
  onDeleteAll: (runIds: string[]) => void;
  onDeleteRun: (runId: string) => void;
  isDeleting: boolean;
}

export function ProductTable({ products, isLoading, onDeleteAll, onDeleteRun, isDeleting }: ProductTableProps) {
  const columns = useMemo(
    () => buildProductColumns(onDeleteAll, isDeleting),
    [onDeleteAll, isDeleting],
  );

  if (isLoading) {
    return <div className="text-sm sf-text-muted py-4">Loading inventory...</div>;
  }

  return (
    <DataTable<ProductGroup>
      data={products}
      columns={columns}
      searchable
      persistKey="storage:products"
      renderExpandedRow={(product) => (
        <RunSubTable
          runs={product.runs}
          onDeleteRun={onDeleteRun}
          isDeleting={isDeleting}
        />
      )}
    />
  );
}
