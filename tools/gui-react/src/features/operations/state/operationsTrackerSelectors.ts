import type { Operation } from './operationsStore.ts';

export const EMPTY_OPERATIONS_MAP: ReadonlyMap<string, Operation> = new Map();

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
