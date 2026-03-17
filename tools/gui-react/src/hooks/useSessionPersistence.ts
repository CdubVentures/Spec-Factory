import { useCallback, useEffect, useMemo, useState } from 'react';

const TAB_STORAGE_KEY = 'tab-store';
const TOGGLE_STORAGE_KEY = 'collapse-store';

interface PersistedTabOptions<T extends string> {
  validValues?: readonly T[];
}

function readStorageEnvelope(storageKey: string): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const local = window.localStorage?.getItem(storageKey) ?? null;
    if (local) {
      const parsed = JSON.parse(local);
      const values = parsed?.state?.values;
      if (values && typeof values === 'object' && !Array.isArray(values)) {
        return values as Record<string, unknown>;
      }
    }
    const session = window.sessionStorage?.getItem(storageKey) ?? null;
    if (session) {
      window.localStorage?.setItem(storageKey, session);
      window.sessionStorage?.removeItem(storageKey);
      const parsed = JSON.parse(session);
      const values = parsed?.state?.values;
      if (values && typeof values === 'object' && !Array.isArray(values)) {
        return values as Record<string, unknown>;
      }
    }
    return {};
  } catch {
    return {};
  }
}

function writeStorageEnvelope(storageKey: string, values: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const payload = JSON.stringify({ state: { values }, version: 0 });
  try {
    window.localStorage.setItem(storageKey, payload);
  } catch {
    // Ignore storage write failures and keep in-memory state.
  }
}

function resolvePersistedTabValue<T extends string>({
  storedValue,
  defaultValue,
  validValues,
}: {
  storedValue: unknown;
  defaultValue: T;
  validValues?: readonly T[];
}): T {
  if (typeof storedValue !== 'string') return defaultValue;
  if (!validValues || validValues.length === 0) return storedValue as T;
  return validValues.includes(storedValue as T) ? (storedValue as T) : defaultValue;
}

export function usePersistedTab<T extends string>(
  key: string,
  defaultValue: T,
  options: PersistedTabOptions<T> = {},
): [T, (value: T) => void] {
  const validValues = options.validValues;
  const validValuesToken = useMemo(
    () => (Array.isArray(validValues) ? validValues.join('||') : ''),
    [validValues],
  );
  const [value, setValue] = useState<T>(() => {
    const values = readStorageEnvelope(TAB_STORAGE_KEY);
    return resolvePersistedTabValue({
      storedValue: values[key],
      defaultValue,
      validValues,
    });
  });

  const setPersistedValue = useCallback((nextValue: T) => {
    const values = readStorageEnvelope(TAB_STORAGE_KEY);
    values[key] = nextValue;
    writeStorageEnvelope(TAB_STORAGE_KEY, values);
    setValue(nextValue);
  }, [key]);

  useEffect(() => {
    const values = readStorageEnvelope(TAB_STORAGE_KEY);
    const nextValue = resolvePersistedTabValue({
      storedValue: values[key],
      defaultValue,
      validValues,
    });
    setValue((currentValue) => (
      currentValue === nextValue ? currentValue : nextValue
    ));
  }, [defaultValue, key, validValuesToken, validValues]);

  return [value, setPersistedValue];
}

export function usePersistedToggle(
  key: string,
  defaultValue: boolean,
): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    const values = readStorageEnvelope(TOGGLE_STORAGE_KEY);
    const stored = values[key];
    return typeof stored === 'boolean' ? stored : defaultValue;
  });

  const setPersistedValue = useCallback((nextValue: boolean) => {
    const values = readStorageEnvelope(TOGGLE_STORAGE_KEY);
    values[key] = nextValue;
    writeStorageEnvelope(TOGGLE_STORAGE_KEY, values);
    setValue(nextValue);
  }, [key]);

  useEffect(() => {
    const values = readStorageEnvelope(TOGGLE_STORAGE_KEY);
    const stored = values[key];
    const nextValue = typeof stored === 'boolean' ? stored : defaultValue;
    setValue((currentValue) => (
      currentValue === nextValue ? currentValue : nextValue
    ));
  }, [defaultValue, key]);

  const toggle = useCallback(() => {
    const nextValue = !value;
    setPersistedValue(nextValue);
  }, [setPersistedValue, value]);

  return [value, toggle, setPersistedValue];
}
