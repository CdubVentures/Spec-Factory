/**
 * usePagination — React hook wrapping computePagination with state + persistence.
 *
 * WHY: All finder history sections need identical pagination behavior.
 * Hook owns page/pageSize state; computePagination does the math.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { computePagination, resolvePersistedPage } from './paginationLogic.ts';

export interface UsePaginationOptions {
  readonly totalItems: number;
  readonly defaultPageSize?: number;
  readonly storageKey?: string;
}

export interface UsePaginationResult {
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly setPage: (p: number) => void;
  readonly setPageSize: (s: number) => void;
  readonly showingLabel: string;
}

function readPersistedPageSize(key: string | undefined, fallback: number): number {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = JSON.parse(raw);
    return typeof n === 'number' && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function writePersistedPageSize(key: string | undefined, value: number): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable — silent
  }
}

function readPersistedPage(key: string | undefined, fallback: number): number {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return resolvePersistedPage(raw, fallback);
  } catch {
    return fallback;
  }
}

function writePersistedPage(key: string | undefined, value: number): void {
  if (!key) return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage unavailable — silent
  }
}

export function usePagination({
  totalItems,
  defaultPageSize = 10,
  storageKey,
}: UsePaginationOptions): UsePaginationResult {
  const pageStorageKey = storageKey ? storageKey + ':page' : undefined;
  const [pageSize, setPageSizeRaw] = useState(() => readPersistedPageSize(storageKey, defaultPageSize));
  const [page, setPageRaw] = useState(() => readPersistedPage(pageStorageKey, 0));

  // Reset page to 0 when totalItems changes (e.g. items deleted)
  useEffect(() => { setPageRaw(0); writePersistedPage(pageStorageKey, 0); }, [totalItems, pageStorageKey]);

  const setPageSize = useCallback((s: number) => {
    setPageSizeRaw(s);
    writePersistedPageSize(storageKey, s);
    setPageRaw(0);
    writePersistedPage(pageStorageKey, 0);
  }, [storageKey, pageStorageKey]);

  const setPage = useCallback((p: number) => { setPageRaw(p); writePersistedPage(pageStorageKey, p); }, [pageStorageKey]);

  const result = useMemo(
    () => computePagination({ totalItems, page, pageSize }),
    [totalItems, page, pageSize],
  );

  return {
    page: result.clampedPage,
    pageSize,
    totalPages: result.totalPages,
    startIndex: result.startIndex,
    endIndex: result.endIndex,
    setPage,
    setPageSize,
    showingLabel: result.showingLabel,
  };
}
