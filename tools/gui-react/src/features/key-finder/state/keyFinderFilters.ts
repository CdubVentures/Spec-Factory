/**
 * keyFinder panel filter state — sessionStorage-persisted, per (category, productId).
 *
 * Filters: search substring + difficulty + availability + required + status.
 * All filters combine with AND semantics.
 */

import { useCallback, useEffect, useState } from 'react';
import type { KeyFilterState } from '../types.ts';
import { DEFAULT_FILTERS } from '../types.ts';

const STORAGE_PREFIX = 'key-finder:filters:';

function storageKey(category: string, productId: string): string {
  return `${STORAGE_PREFIX}${category}::${productId}`;
}

function readFromStorage(category: string, productId: string): KeyFilterState {
  if (!category || !productId) return { ...DEFAULT_FILTERS };
  try {
    const raw = sessionStorage.getItem(storageKey(category, productId));
    if (!raw) return { ...DEFAULT_FILTERS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_FILTERS, ...parsed };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

function writeToStorage(category: string, productId: string, filters: KeyFilterState): void {
  if (!category || !productId) return;
  try {
    sessionStorage.setItem(storageKey(category, productId), JSON.stringify(filters));
  } catch {
    /* quota or availability — ignore */
  }
}

export function useKeyFinderFilters(category: string, productId: string) {
  const [filters, setFilters] = useState<KeyFilterState>(() => readFromStorage(category, productId));

  // Re-hydrate when product changes
  useEffect(() => {
    setFilters(readFromStorage(category, productId));
  }, [category, productId]);

  // Persist on change
  useEffect(() => {
    writeToStorage(category, productId, filters);
  }, [category, productId, filters]);

  const updateFilter = useCallback(<K extends keyof KeyFilterState>(key: K, value: KeyFilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  const hasActiveFilters = filters.search !== ''
    || filters.difficulty !== ''
    || filters.availability !== ''
    || filters.required !== ''
    || filters.status !== '';

  return { filters, updateFilter, resetFilters, hasActiveFilters };
}
