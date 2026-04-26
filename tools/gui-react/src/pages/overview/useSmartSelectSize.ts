import { useCallback, useState } from 'react';

// WHY: single global slider value (not per-category). Stored under one key so
// users get the same "lowest N" / "next N" sample size everywhere in Overview.
export const SMART_SELECT_SIZE_KEY = 'sf:overview:smartSelectSize';
export const SMART_SELECT_SIZE_DEFAULT = 10;
export const SMART_SELECT_SIZE_MIN = 1;
export const SMART_SELECT_SIZE_MAX = 50;

interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function clampSmartSelectSize(raw: unknown, fallback: number = SMART_SELECT_SIZE_DEFAULT): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  if (rounded < SMART_SELECT_SIZE_MIN) return SMART_SELECT_SIZE_MIN;
  if (rounded > SMART_SELECT_SIZE_MAX) return SMART_SELECT_SIZE_MAX;
  return rounded;
}

export function readSmartSelectSize(storage: MinimalStorage | null | undefined): number {
  if (!storage) return SMART_SELECT_SIZE_DEFAULT;
  try {
    const raw = storage.getItem(SMART_SELECT_SIZE_KEY);
    if (raw === null || raw === '') return SMART_SELECT_SIZE_DEFAULT;
    return clampSmartSelectSize(raw);
  } catch {
    return SMART_SELECT_SIZE_DEFAULT;
  }
}

export function writeSmartSelectSize(storage: MinimalStorage | null | undefined, size: number): void {
  if (!storage) return;
  try {
    storage.setItem(SMART_SELECT_SIZE_KEY, String(clampSmartSelectSize(size)));
  } catch {
    /* storage full / disabled — drop silently */
  }
}

function getLocalStorage(): MinimalStorage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage as MinimalStorage;
}

export interface UseSmartSelectSizeResult {
  readonly size: number;
  readonly setSize: (next: number) => void;
}

/**
 * Single global Smart-select sample size, persisted in localStorage.
 * Returns the live numeric value (so callers can re-render against it) plus
 * a setter that clamps to [MIN, MAX] and writes through to storage.
 */
export function useSmartSelectSize(): UseSmartSelectSizeResult {
  const [size, setSizeState] = useState<number>(() => readSmartSelectSize(getLocalStorage()));

  const setSize = useCallback((next: number) => {
    const clamped = clampSmartSelectSize(next);
    setSizeState(clamped);
    writeSmartSelectSize(getLocalStorage(), clamped);
  }, []);

  return { size, setSize };
}
