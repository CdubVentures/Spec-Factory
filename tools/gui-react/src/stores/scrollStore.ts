import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/* ── Types ─────────────────────────────────────────────────────────── */

export interface ScrollPosition {
  top: number;
  left: number;
}

interface ScrollStoreState {
  values: Record<string, string>;
  set: (key: string, pos: ScrollPosition) => void;
  clear: (key: string) => void;
}

/* ── Storage helpers (sessionStorage — clears on browser close) ──── */

const STORAGE_KEY = 'scroll-store';

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

function loadInitialValues(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_KEY) ?? null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed?.state?.values && typeof parsed.state.values === 'object') {
      return parsed.state.values;
    }
  } catch { /* corrupt or missing - start fresh */ }
  return {};
}

/* ── Resolver (pure, testable) ─────────────────────────────────────── */

export function resolveScrollPosition(
  storedValue: string | null | undefined,
): ScrollPosition | null {
  if (typeof storedValue !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(storedValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    const top = typeof obj.top === 'number' && Number.isFinite(obj.top) ? obj.top : 0;
    const left = typeof obj.left === 'number' && Number.isFinite(obj.left) ? obj.left : 0;
    if (top === 0 && left === 0) return null;
    return { top, left };
  } catch {
    return null;
  }
}

/* ── Store ──────────────────────────────────────────────────────────── */

const initialValues = loadInitialValues();
const storage = createJSONStorage(() => getSessionStorage());

export const useScrollStore = create<ScrollStoreState>()(
  persist(
    (set) => ({
      values: initialValues,
      set: (key, pos) =>
        set((s) => ({ values: { ...s.values, [key]: JSON.stringify(pos) } })),
      clear: (key) =>
        set((s) => {
          const next = { ...s.values };
          delete next[key];
          return { values: next };
        }),
    }),
    {
      name: STORAGE_KEY,
      storage,
      partialize: (state) => ({ values: state.values }),
      merge: (persisted, current) => ({
        ...current,
        values: {
          ...current.values,
          ...((persisted as Partial<ScrollStoreState>)?.values ?? {}),
        },
      }),
    },
  ),
);
