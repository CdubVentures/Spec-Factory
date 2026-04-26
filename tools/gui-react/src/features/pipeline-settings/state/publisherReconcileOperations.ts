import type { Operation } from '../../operations/state/operationsStore.ts';

export function selectActivePublisherReconcileOperation(
  operations: ReadonlyMap<string, Operation>,
  category: string,
): Operation | null {
  for (const op of operations.values()) {
    if (op.type === 'publisher-reconcile' && op.category === category && op.status === 'running') {
      return op;
    }
  }
  return null;
}
