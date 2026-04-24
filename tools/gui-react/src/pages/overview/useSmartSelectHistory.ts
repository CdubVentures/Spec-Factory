import { useCallback, useState } from 'react';
import { pruneHistory, type SmartSelectHistoryEntry } from './smartSelect.ts';

const STORAGE_PREFIX = 'sf:overview:smartSelectHistory:';

function storageKey(category: string): string {
  return `${STORAGE_PREFIX}${category}`;
}

function readHistory(category: string): SmartSelectHistoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(category));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SmartSelectHistoryEntry[] = [];
    for (const entry of parsed) {
      if (
        entry && typeof entry === 'object' &&
        typeof (entry as { productId?: unknown }).productId === 'string' &&
        typeof (entry as { selectedAt?: unknown }).selectedAt === 'number'
      ) {
        out.push({
          productId: (entry as { productId: string }).productId,
          selectedAt: (entry as { selectedAt: number }).selectedAt,
        });
      }
    }
    return pruneHistory(out);
  } catch {
    return [];
  }
}

function writeHistory(category: string, history: readonly SmartSelectHistoryEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(category), JSON.stringify(history));
  } catch {
    /* storage full / disabled — drop silently */
  }
}

export interface UseSmartSelectHistoryResult {
  readonly getHistory: () => SmartSelectHistoryEntry[];
  readonly setHistory: (history: readonly SmartSelectHistoryEntry[]) => void;
  readonly clear: () => void;
}

/**
 * Thin localStorage wrapper keyed by category. Returns imperative accessors
 * rather than state so callers can fetch the freshest history at click-time
 * without re-rendering the button on every change.
 */
export function useSmartSelectHistory(category: string): UseSmartSelectHistoryResult {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars — version counter triggers re-render on clear
  const [_version, setVersion] = useState(0);

  const getHistory = useCallback(() => readHistory(category), [category]);

  const setHistory = useCallback(
    (history: readonly SmartSelectHistoryEntry[]) => {
      writeHistory(category, history);
      setVersion((v) => v + 1);
    },
    [category],
  );

  const clear = useCallback(() => {
    writeHistory(category, []);
    setVersion((v) => v + 1);
  }, [category]);

  return { getHistory, setHistory, clear };
}
