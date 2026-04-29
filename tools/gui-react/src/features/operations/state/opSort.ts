import type { Operation } from './operationsStore.ts';

// WHY: Three user-selectable sort modes, persisted in sessionStorage.
//  - 'queue'   — order called (startedAt ASC). Oldest at top, newest at bottom.
//  - 'recent'  — newest first (startedAt DESC). Flat list, no status grouping.
//  - 'grouped' — status-first (running → error → cancelled → done),
//                newest-first within each group. Legacy default.
export type OpSortMode = 'queue' | 'recent' | 'grouped';

export const SORT_MODES: readonly {
  readonly value: OpSortMode;
  readonly label: string;
  readonly title: string;
}[] = [
  { value: 'queue', label: 'Queue', title: 'Order called (oldest first)' },
  { value: 'recent', label: 'Recent', title: 'Newest first' },
  { value: 'grouped', label: 'Status', title: 'Group by status (running → done)' },
];

const STATUS_ORDER: Readonly<Record<string, number>> = {
  running: 0,
  error: 1,
  cancelled: 2,
  done: 3,
};

/**
 * Pure sort function. Does not mutate the input map.
 * Ties on the primary key fall through to startedAt (oldest first in 'queue',
 * newest first in the others). `_seq` is not read here — operations share
 * `startedAt` rarely enough that string comparison is sufficient.
 */
export function sortOperations(
  ops: ReadonlyMap<string, Operation>,
  mode: OpSortMode = 'queue',
): Operation[] {
  const all = [...ops.values()];
  if (mode === 'queue') {
    return all.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
  if (mode === 'recent') {
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  return all.sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 0;
    const sb = STATUS_ORDER[b.status] ?? 0;
    if (sa !== sb) return sa - sb;
    return b.startedAt.localeCompare(a.startedAt);
  });
}

export const SORT_MODE_STORAGE_KEY = 'ops-tracker:sort-mode';

export function readSortMode(): OpSortMode {
  if (typeof window === 'undefined') return 'queue';
  try {
    const raw = window.sessionStorage?.getItem(SORT_MODE_STORAGE_KEY);
    if (raw === 'queue' || raw === 'recent' || raw === 'grouped') return raw;
  } catch { /* ignore storage errors */ }
  return 'queue';
}

export function writeSortMode(mode: OpSortMode): void {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage?.setItem(SORT_MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
}
