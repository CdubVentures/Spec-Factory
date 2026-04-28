import type { Operation } from './operationsStore.ts';
import { parseBackendMs } from '../../../utils/dateTime.ts';
import { isOperationUiActiveStatus } from './operationStatusContract.ts';

type OperationStatus = Operation['status'];

export function isOperationElapsedTimerActive(status: OperationStatus): boolean {
  return isOperationUiActiveStatus(status);
}

export function formatOperationElapsed(
  op: Pick<Operation, 'startedAt' | 'endedAt'>,
  nowMs: number = Date.now(),
): string {
  const end = op.endedAt ? parseBackendMs(op.endedAt) : nowMs;
  const start = parseBackendMs(op.startedAt);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return '0:00';
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatOperationStatusText(
  op: Pick<Operation, 'status' | 'startedAt' | 'endedAt'>,
  nowMs: number = Date.now(),
): string {
  const elapsed = formatOperationElapsed(op, nowMs);
  if (op.status === 'done') return `done ${elapsed}`;
  if (op.status === 'error') return `failed ${elapsed}`;
  if (op.status === 'cancelled') return `cancelled ${elapsed}`;
  return elapsed;
}
