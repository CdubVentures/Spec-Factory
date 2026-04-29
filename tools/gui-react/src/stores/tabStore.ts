import { useCallback } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

interface TabStoreState {
  values: Record<string, string | null>;
  set: (key: string, value: string | null) => void;
  setBatch: (updates: Record<string, string | null>) => void;
  clear: (key: string) => void;
}

interface PersistedTabOptions<T extends string> {
  validValues?: readonly T[];
}

function isAllowedValue<T extends string>(
  value: string,
  validValues?: readonly T[],
): value is T {
  if (!validValues || validValues.length === 0) return true;
  return validValues.includes(value as T);
}

function resolvePersistedTabValue<T extends string>({
  storedValue,
  defaultValue,
  validValues,
}: {
  storedValue: string | null | undefined;
  defaultValue: T;
  validValues?: readonly T[];
}): T {
  if (typeof storedValue !== 'string') return defaultValue;
  return isAllowedValue(storedValue, validValues) ? storedValue : defaultValue;
}

function resolvePersistedNullableTabValue<T extends string>({
  storedValue,
  defaultValue,
  validValues,
}: {
  storedValue: string | null | undefined;
  defaultValue: T | null;
  validValues?: readonly T[];
}): T | null {
  if (storedValue === null) return null;
  if (typeof storedValue !== 'string') return defaultValue;
  return isAllowedValue(storedValue, validValues) ? storedValue : defaultValue;
}

const TAB_STORAGE_KEY = 'tab-store';

const noopStorage: StateStorage = {
  getItem: (_name) => null,
  setItem: (_name, _value) => {},
  removeItem: (_name) => {},
};

function getSessionStorage() {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return noopStorage;
  }
  return window.sessionStorage;
}

function loadInitialTabValues(): Record<string, string | null> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage?.getItem(TAB_STORAGE_KEY) ?? null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed?.state?.values && typeof parsed.state.values === 'object') {
      return parsed.state.values;
    }
  } catch { /* corrupt or missing - start fresh */ }
  return {};
}

const initialTabValues = loadInitialTabValues();
const storage = createJSONStorage(() => getSessionStorage());

export const useTabStore = create<TabStoreState>()(
  persist(
    (set) => ({
      values: initialTabValues,
      set: (key, value) =>
        set((s) => ({ values: { ...s.values, [key]: value } })),
      setBatch: (updates) =>
        set((s) => ({ values: { ...s.values, ...updates } })),
      clear: (key) =>
        set((s) => {
          const next = { ...s.values };
          delete next[key];
          return { values: next };
        }),
    }),
    {
      name: TAB_STORAGE_KEY,
      storage,
      partialize: (state) => ({ values: state.values }),
      merge: (persisted, current) => ({
        ...current,
        values: {
          ...current.values,
          ...((persisted as Partial<TabStoreState>)?.values ?? {}),
        },
      }),
    },
  ),
);

export function usePersistedTab<T extends string>(
  key: string,
  defaultValue: T,
  options: PersistedTabOptions<T> = {},
): [T, (value: T) => void] {
  const storedValue = useTabStore((s) => s.values[key]);
  const setFn = useTabStore((s) => s.set);
  const value = resolvePersistedTabValue({
    storedValue,
    defaultValue,
    validValues: options.validValues,
  });
  return [value, (next: T) => setFn(key, next)];
}

export function usePersistedNullableTab<T extends string>(
  key: string,
  defaultValue: T | null,
  options: PersistedTabOptions<T> = {},
): [T | null, (value: T | null) => void] {
  const storedValue = useTabStore((s) => s.values[key]);
  const setFn = useTabStore((s) => s.set);
  const value = resolvePersistedNullableTabValue({
    storedValue,
    defaultValue,
    validValues: options.validValues,
  });
  return [value, (next: T | null) => setFn(key, next)];
}

/* ── Expand Map ────────────────────────────────────────────────────── */

export function resolvePersistedExpandMap({
  storedValue,
  defaultValue = {},
}: {
  storedValue: string | null | undefined;
  defaultValue?: Record<string, boolean>;
}): Record<string, boolean> {
  if (typeof storedValue !== 'string') return defaultValue;
  try {
    const parsed: unknown = JSON.parse(storedValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultValue;
    const result: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') result[k] = v;
    }
    return result;
  } catch {
    return defaultValue;
  }
}

export function usePersistedExpandMap(
  key: string,
  defaultValue: Record<string, boolean> = {},
): [Record<string, boolean>, (id: string) => void, (next: Record<string, boolean>) => void] {
  const storedValue = useTabStore((s) => s.values[key]);
  const setFn = useTabStore((s) => s.set);

  const value = resolvePersistedExpandMap({ storedValue, defaultValue });

  const toggle = useCallback((id: string) => {
    const currentRaw = useTabStore.getState().values[key];
    const current = resolvePersistedExpandMap({ storedValue: currentRaw, defaultValue });
    const next = { ...current, [id]: !current[id] };
    setFn(key, JSON.stringify(next));
  }, [key, defaultValue, setFn]);

  const replace = useCallback((next: Record<string, boolean>) => {
    setFn(key, JSON.stringify(next));
  }, [key, setFn]);

  return [value, toggle, replace];
}

/* ── Persisted JSON value ──────────────────────────────────────────── */

export function resolvePersistedJson<T>({
  storedValue,
  defaultValue,
  validate,
}: {
  storedValue: string | null | undefined;
  defaultValue: T;
  validate?: (parsed: unknown) => parsed is T;
}): T {
  if (typeof storedValue !== 'string' || storedValue === '') return defaultValue;
  try {
    const parsed: unknown = JSON.parse(storedValue);
    if (validate && !validate(parsed)) return defaultValue;
    return parsed as T;
  } catch {
    return defaultValue;
  }
}

export function usePersistedJson<T>(
  key: string,
  defaultValue: T,
  validate?: (parsed: unknown) => parsed is T,
): [T, (next: T) => void] {
  const storedValue = useTabStore((s) => s.values[key]);
  const setFn = useTabStore((s) => s.set);

  const value = resolvePersistedJson({ storedValue, defaultValue, validate });

  const setter = useCallback((next: T) => {
    setFn(key, JSON.stringify(next));
  }, [key, setFn]);

  return [value, setter];
}

/* ── Persisted Number ──────────────────────────────────────────────── */

export function resolvePersistedNumber({
  storedValue,
  defaultValue,
}: {
  storedValue: string | null | undefined;
  defaultValue: number;
}): number {
  if (typeof storedValue !== 'string' || storedValue === '') return defaultValue;
  const num = Number(storedValue);
  return Number.isFinite(num) ? num : defaultValue;
}

export function usePersistedNumber(
  key: string,
  defaultValue: number,
): [number, (value: number) => void] {
  const storedValue = useTabStore((s) => s.values[key]);
  const setFn = useTabStore((s) => s.set);

  const value = resolvePersistedNumber({ storedValue, defaultValue });

  const setter = useCallback((next: number) => {
    setFn(key, String(next));
  }, [key, setFn]);

  return [value, setter];
}