import type { Operation } from './operationsStore.ts';

export function selectOperationDetailDisplay(
  summary: Operation,
  detail: Operation | null | undefined,
): Operation {
  return detail ?? summary;
}
