import type { RuntimeOpsWorkerRow } from '../types';

export declare function sortWorkersForTabs(
  workers?: RuntimeOpsWorkerRow[],
): RuntimeOpsWorkerRow[];

export declare function buildWorkerButtonLabel(
  worker: RuntimeOpsWorkerRow,
): string;

export declare function buildWorkerButtonSubtitle(
  worker: RuntimeOpsWorkerRow,
): string | null;
