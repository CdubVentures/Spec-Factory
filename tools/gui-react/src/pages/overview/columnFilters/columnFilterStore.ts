import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export type CefBucket = 'any' | '0' | '1' | '2';
export type PifMetric = 'priority' | 'loop' | 'hero' | 'image';
export type HasValueMode = 'any' | 'yes' | 'no';
export type GradeBucket = 'A' | 'B' | 'C' | 'D' | 'F';

export interface NumericRange {
  readonly min: number | null;
  readonly max: number | null;
}

export interface PifFilter {
  readonly metric: PifMetric;
  readonly min: number | null;
}

export interface ScalarFilter {
  readonly hasValue: HasValueMode;
  readonly minConfidence: number | null;
}

export interface KeysFilter {
  readonly tiers: readonly string[];
  readonly minResolvedPct: number | null;
}

export interface ColumnFilterState {
  readonly brand: readonly string[];
  readonly cef: CefBucket;
  readonly pif: PifFilter;
  readonly rdf: ScalarFilter;
  readonly sku: ScalarFilter;
  readonly keys: KeysFilter;
  readonly score: readonly GradeBucket[];
  readonly coverage: NumericRange;
  readonly confidence: NumericRange;
  readonly fields: NumericRange;
}

export type ColumnFilterKey = keyof ColumnFilterState;

export const DEFAULT_FILTER_STATE: ColumnFilterState = Object.freeze({
  brand: Object.freeze([]) as readonly string[],
  cef: 'any',
  pif: Object.freeze({ metric: 'priority', min: null }) as PifFilter,
  rdf: Object.freeze({ hasValue: 'any', minConfidence: null }) as ScalarFilter,
  sku: Object.freeze({ hasValue: 'any', minConfidence: null }) as ScalarFilter,
  keys: Object.freeze({ tiers: Object.freeze([]) as readonly string[], minResolvedPct: null }) as KeysFilter,
  score: Object.freeze([]) as readonly GradeBucket[],
  coverage: Object.freeze({ min: null, max: null }) as NumericRange,
  confidence: Object.freeze({ min: null, max: null }) as NumericRange,
  fields: Object.freeze({ min: null, max: null }) as NumericRange,
});

interface ColumnFilterStoreState {
  byCategory: Record<string, ColumnFilterState>;
  patch: <K extends ColumnFilterKey>(category: string, key: K, value: ColumnFilterState[K]) => void;
  clearColumn: (category: string, key: ColumnFilterKey) => void;
  clearAll: (category: string) => void;
}

const STORAGE_KEY = 'sf:overview:column-filters';

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function getLocalStorage(): StateStorage {
  if (typeof window === 'undefined' || !window.localStorage) return noopStorage;
  return window.localStorage;
}

const storage = createJSONStorage(() => getLocalStorage());

export const useColumnFilterStore = create<ColumnFilterStoreState>()(
  persist(
    (set) => ({
      byCategory: {},
      patch: (category, key, value) =>
        set((s) => {
          const current = s.byCategory[category] ?? DEFAULT_FILTER_STATE;
          return {
            byCategory: {
              ...s.byCategory,
              [category]: { ...current, [key]: value },
            },
          };
        }),
      clearColumn: (category, key) =>
        set((s) => {
          const current = s.byCategory[category] ?? DEFAULT_FILTER_STATE;
          return {
            byCategory: {
              ...s.byCategory,
              [category]: { ...current, [key]: DEFAULT_FILTER_STATE[key] },
            },
          };
        }),
      clearAll: (category) =>
        set((s) => {
          if (!s.byCategory[category]) return s;
          const next = { ...s.byCategory };
          delete next[category];
          return { byCategory: next };
        }),
    }),
    {
      name: STORAGE_KEY,
      storage,
      partialize: (state) => ({ byCategory: state.byCategory }),
    },
  ),
);

export function selectFilterState(category: string) {
  return (s: ColumnFilterStoreState): ColumnFilterState =>
    s.byCategory[category] ?? DEFAULT_FILTER_STATE;
}

export function isColumnActive<K extends ColumnFilterKey>(
  state: ColumnFilterState,
  key: K,
): boolean {
  const v = state[key];
  const def = DEFAULT_FILTER_STATE[key];
  if (Array.isArray(v) && Array.isArray(def)) return v.length > 0;
  if (typeof v === 'string' && typeof def === 'string') return v !== def;
  if (v && typeof v === 'object' && def && typeof def === 'object') {
    return JSON.stringify(v) !== JSON.stringify(def);
  }
  return false;
}

export function activeColumnCount(state: ColumnFilterState): number {
  let count = 0;
  for (const k of Object.keys(DEFAULT_FILTER_STATE) as ColumnFilterKey[]) {
    if (isColumnActive(state, k)) count++;
  }
  return count;
}
