import type { Operation } from './operationsStore.ts';

export interface CancelActiveOperationsResult {
  readonly requestedIds: readonly string[];
  readonly failedIds: readonly string[];
}

type CancelOperation = (operationId: string) => Promise<unknown>;

function isActiveOperation(op: Operation): boolean {
  return op.status === 'queued' || op.status === 'running';
}

export function selectActiveOperationIds(operations: readonly Operation[]): string[] {
  return operations.filter(isActiveOperation).map((op) => op.id);
}

export function formatStopAllActiveOperationsMessage(count: number): string {
  return `Stop ${count} active operations?\n\nQueued operations will not start. Running operations will be asked to cancel and may finish their current provider call first.`;
}

export async function cancelActiveOperations(
  operations: readonly Operation[],
  cancelOperation: CancelOperation,
): Promise<CancelActiveOperationsResult> {
  const requestedIds = selectActiveOperationIds(operations);
  const results = await Promise.allSettled(requestedIds.map((id) => cancelOperation(id)));
  const failedIds = requestedIds.filter((_, index) => results[index]?.status === 'rejected');

  return { requestedIds, failedIds };
}
