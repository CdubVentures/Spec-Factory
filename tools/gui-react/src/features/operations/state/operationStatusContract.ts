import type { Operation } from './operationsStore.ts';

export type OperationStatus = Operation['status'];

export interface OperationStatusCounts {
  readonly queued: number;
  readonly running: number;
  readonly done: number;
  readonly error: number;
  readonly cancelled: number;
}

interface OperationStatusContract {
  readonly allStatuses: readonly OperationStatus[];
  readonly uiActiveStatuses: readonly OperationStatus[];
  readonly resourceRunningStatuses: readonly OperationStatus[];
  readonly terminalStatuses: readonly OperationStatus[];
}

export const OPERATION_STATUS_CONTRACT = {
  allStatuses: ['queued', 'running', 'done', 'error', 'cancelled'],
  uiActiveStatuses: ['queued', 'running'],
  resourceRunningStatuses: ['running'],
  terminalStatuses: ['done', 'error', 'cancelled'],
} as const satisfies OperationStatusContract;

export type UiActiveOperationStatus = (typeof OPERATION_STATUS_CONTRACT.uiActiveStatuses)[number];
export type ResourceRunningOperationStatus = (typeof OPERATION_STATUS_CONTRACT.resourceRunningStatuses)[number];
export type TerminalOperationStatus = (typeof OPERATION_STATUS_CONTRACT.terminalStatuses)[number];

function includesStatus(statuses: readonly OperationStatus[], status: OperationStatus): boolean {
  return statuses.includes(status);
}

export function isOperationUiActiveStatus(status: OperationStatus): status is UiActiveOperationStatus {
  return includesStatus(OPERATION_STATUS_CONTRACT.uiActiveStatuses, status);
}

export function isOperationResourceRunningStatus(status: OperationStatus): status is ResourceRunningOperationStatus {
  return includesStatus(OPERATION_STATUS_CONTRACT.resourceRunningStatuses, status);
}

export function isOperationTerminalStatus(status: OperationStatus): status is TerminalOperationStatus {
  return includesStatus(OPERATION_STATUS_CONTRACT.terminalStatuses, status);
}

export function countOperationStatuses(
  operations: Iterable<Pick<Operation, 'status'>>,
): OperationStatusCounts {
  const counts: Record<OperationStatus, number> = {
    queued: 0,
    running: 0,
    done: 0,
    error: 0,
    cancelled: 0,
  };
  for (const operation of operations) {
    counts[operation.status] += 1;
  }
  return counts;
}

export function countUiActiveOperations(
  operations: Iterable<Pick<Operation, 'status'>>,
): number {
  let count = 0;
  for (const operation of operations) {
    if (isOperationUiActiveStatus(operation.status)) count += 1;
  }
  return count;
}

export function countResourceRunningOperations(
  operations: Iterable<Pick<Operation, 'status'>>,
): number {
  let count = 0;
  for (const operation of operations) {
    if (isOperationResourceRunningStatus(operation.status)) count += 1;
  }
  return count;
}
