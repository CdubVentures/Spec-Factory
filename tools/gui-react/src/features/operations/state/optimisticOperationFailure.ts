import type { OperationUpsert } from './operationsStore.ts';

const OPTIMISTIC_FAILURE_FALLBACK = 'Dispatch failed';
const OPTIMISTIC_FAILURE_MAX_CHARS = 200;

export function formatOptimisticOperationFailure(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  const normalized = message.trim();
  return (normalized || OPTIMISTIC_FAILURE_FALLBACK).slice(0, OPTIMISTIC_FAILURE_MAX_CHARS);
}

export function markOptimisticOperationFailed(
  operation: OperationUpsert,
  error: unknown,
): OperationUpsert {
  return {
    ...operation,
    status: 'error',
    endedAt: new Date().toISOString(),
    error: formatOptimisticOperationFailure(error),
  };
}
