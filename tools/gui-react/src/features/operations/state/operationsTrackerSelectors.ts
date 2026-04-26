import type { Operation } from './operationsStore.ts';
import type { CatalogRow } from '../../../types/product.ts';

export const EMPTY_OPERATIONS_MAP: ReadonlyMap<string, Operation> = new Map();

export interface OperationIndexLabLinkIdentity {
  readonly productId: string;
  readonly brand: string;
  readonly baseModel: string;
}

export function selectActiveOperationCount(
  operations: ReadonlyMap<string, Operation>,
): number {
  let count = 0;
  for (const op of operations.values()) {
    if (op.status === 'queued' || op.status === 'running') {
      count += 1;
    }
  }
  return count;
}

export function selectVisibleOperationsMap(
  operations: ReadonlyMap<string, Operation>,
  isOpen: boolean,
): ReadonlyMap<string, Operation> {
  return isOpen ? operations : EMPTY_OPERATIONS_MAP;
}

export function selectOperationById(
  operations: ReadonlyMap<string, Operation>,
  operationId: string | null,
): Operation | null {
  if (!operationId) return null;
  return operations.get(operationId) ?? null;
}

export function resolveOperationIndexLabLinkIdentity(
  op: Pick<Operation, 'productId'>,
  catalogRows: readonly CatalogRow[],
): OperationIndexLabLinkIdentity {
  const row = catalogRows.find((entry) => entry.productId === op.productId);
  return {
    productId: row?.productId ?? op.productId,
    brand: row?.brand ?? '',
    baseModel: row?.base_model ?? '',
  };
}
