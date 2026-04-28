import type { Operation } from './operationsStore.ts';
import type { CatalogRow } from '../../../types/product.ts';
import { countUiActiveOperations } from './operationStatusContract.ts';

export const EMPTY_OPERATIONS_MAP: ReadonlyMap<string, Operation> = new Map();

export interface OperationIndexLabLinkIdentity {
  readonly productId: string;
  readonly brand: string;
  readonly baseModel: string;
}

export function selectActiveOperationCount(
  operations: ReadonlyMap<string, Operation>,
): number {
  return countUiActiveOperations(operations.values());
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
  op: Pick<Operation, 'productId' | 'indexLabLinkIdentity'>,
  catalogRows: readonly CatalogRow[] = [],
): OperationIndexLabLinkIdentity {
  if (op.indexLabLinkIdentity) {
    return {
      productId: op.indexLabLinkIdentity.productId || op.productId,
      brand: op.indexLabLinkIdentity.brand || '',
      baseModel: op.indexLabLinkIdentity.baseModel || '',
    };
  }

  const row = catalogRows.find((entry) => entry.productId === op.productId);
  return {
    productId: row?.productId ?? op.productId,
    brand: row?.brand ?? '',
    baseModel: row?.base_model ?? '',
  };
}
