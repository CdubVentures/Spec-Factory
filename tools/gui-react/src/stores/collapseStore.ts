import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

interface CollapseStoreState {
  values: Record<string, boolean>;
  set: (key: string, value: boolean) => void;
  toggle: (key: string, defaultValue?: boolean) => void;
  setBatch: (updates: Record<string, boolean>) => void;
}

const STORAGE_KEY = 'collapse-store';

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

function readSessionStorageItem(name: string) {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    return window.sessionStorage.getItem(name);
  } catch {
    return null;
  }
}

function loadInitialValues(): Record<string, boolean> {
  try {
    const raw = readSessionStorageItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed?.state?.values && typeof parsed.state.values === 'object') {
      return parsed.state.values;
    }
  } catch { /* corrupt or missing - start fresh */ }
  return {};
}

const initialValues = loadInitialValues();
const storage = createJSONStorage(() => getSessionStorage());

export const useCollapseStore = create<CollapseStoreState>()(
  persist(
    (set) => ({
      values: initialValues,
      set: (key, value) =>
        set((s) => ({ values: { ...s.values, [key]: value } })),
      toggle: (key, defaultValue = false) =>
        set((s) => ({
          values: { ...s.values, [key]: !(s.values[key] ?? defaultValue) },
        })),
      setBatch: (updates) =>
        set((s) => ({ values: { ...s.values, ...updates } })),
    }),
    {
      name: STORAGE_KEY,
      storage,
      partialize: (state) => ({ values: state.values }),
      merge: (persisted, current) => ({
        ...current,
        values: {
          ...current.values,
          ...((persisted as Partial<CollapseStoreState>)?.values ?? {}),
        },
      }),
    },
  ),
);

export function usePersistedToggle(
  key: string,
  defaultValue: boolean,
): [boolean, () => void, (v: boolean) => void] {
  const value = useCollapseStore((s) => s.values[key] ?? defaultValue);
  const toggleFn = useCollapseStore((s) => s.toggle);
  const setFn = useCollapseStore((s) => s.set);
  return [value, () => toggleFn(key, defaultValue), (v: boolean) => setFn(key, v)];
}