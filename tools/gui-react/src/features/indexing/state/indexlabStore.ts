import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export interface IndexLabEvent {
  run_id: string;
  category?: string;
  product_id?: string;
  ts: string;
  stage: string;
  event: string;
  payload?: Record<string, unknown>;
}

export interface PickerRecentSelection {
  productId: string;
  brand: string;
  model: string;
  variant: string;
  at: number;
}

interface IndexLabState {
  byRun: Record<string, IndexLabEvent[]>;
  appendEvents: (events: IndexLabEvent[]) => void;
  clearRun: (runId: string) => void;
  clearAll: () => void;

  pickerBrand: string;
  pickerModel: string;
  pickerProductId: string;
  pickerRunId: string;
  recentSelections: PickerRecentSelection[];
  setPickerBrand: (brand: string) => void;
  setPickerModel: (model: string) => void;
  setPickerProductId: (productId: string) => void;
  setPickerRunId: (runId: string) => void;
  pushRecent: (entry: PickerRecentSelection) => void;
  clearRecents: () => void;
}

const MAX_PER_RUN = 4000;
const MAX_RECENTS = 6;
const STORAGE_KEY = 'indexlab-store';

type PersistedPickerState = Pick<
  IndexLabState,
  'pickerBrand' | 'pickerModel' | 'pickerProductId' | 'pickerRunId' | 'recentSelections'
>;

const noopStorage: StateStorage = {
  getItem: (_name) => null,
  setItem: (_name, _value) => {},
  removeItem: (_name) => {},
};

function getLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return noopStorage;
  }
  return window.localStorage;
}

function sanitizeRecents(raw: unknown): PickerRecentSelection[] {
  if (!Array.isArray(raw)) return [];
  const valid: PickerRecentSelection[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.productId !== 'string' || !e.productId) continue;
    valid.push({
      productId: e.productId,
      brand: typeof e.brand === 'string' ? e.brand : '',
      model: typeof e.model === 'string' ? e.model : '',
      variant: typeof e.variant === 'string' ? e.variant : '',
      at: typeof e.at === 'number' ? e.at : 0,
    });
    if (valid.length >= MAX_RECENTS) break;
  }
  return valid;
}

function loadInitialPickerState(): PersistedPickerState {
  const defaults: PersistedPickerState = {
    pickerBrand: '',
    pickerModel: '',
    pickerProductId: '',
    pickerRunId: '',
    recentSelections: [],
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY) ?? null;
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const values = parsed?.state;
    return {
      pickerBrand: typeof values?.pickerBrand === 'string' ? values.pickerBrand : '',
      pickerModel: typeof values?.pickerModel === 'string' ? values.pickerModel : '',
      pickerProductId: typeof values?.pickerProductId === 'string' ? values.pickerProductId : '',
      pickerRunId: typeof values?.pickerRunId === 'string' ? values.pickerRunId : '',
      recentSelections: sanitizeRecents(values?.recentSelections),
    };
  } catch {
    return defaults;
  }
}

const initialPickerState = loadInitialPickerState();
const storage = createJSONStorage(() => getLocalStorage());

export const useIndexLabStore = create<IndexLabState>()(
  persist(
    (set) => ({
      byRun: {},
      appendEvents: (events) => set((state) => {
        if (!Array.isArray(events) || events.length === 0) return state;
        const next = { ...state.byRun };
        for (const row of events) {
          const runId = String(row?.run_id || '').trim();
          if (!runId) continue;
          const list = Array.isArray(next[runId]) ? [...next[runId]] : [];
          list.push(row);
          next[runId] = list.slice(-MAX_PER_RUN);
        }
        return { byRun: next };
      }),
      clearRun: (runId) => set((state) => {
        const token = String(runId || '').trim();
        if (!token || !state.byRun[token]) return state;
        const next = { ...state.byRun };
        delete next[token];
        return { byRun: next };
      }),
      clearAll: () => set({ byRun: {} }),

      ...initialPickerState,
      setPickerBrand: (brand) => set({ pickerBrand: brand, pickerModel: '', pickerProductId: '' }),
      setPickerModel: (model) => set({ pickerModel: model, pickerProductId: '' }),
      setPickerProductId: (productId) => set({ pickerProductId: productId }),
      setPickerRunId: (runId) => set({ pickerRunId: runId }),
      pushRecent: (entry) => set((state) => {
        const productId = String(entry?.productId || '').trim();
        if (!productId) return state;
        const filtered = state.recentSelections.filter((r) => r.productId !== productId);
        const next = [{ ...entry, productId, at: entry.at || Date.now() }, ...filtered];
        return { recentSelections: next.slice(0, MAX_RECENTS) };
      }),
      clearRecents: () => set({ recentSelections: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage,
      partialize: (state) => ({
        pickerBrand: state.pickerBrand,
        pickerModel: state.pickerModel,
        pickerProductId: state.pickerProductId,
        pickerRunId: state.pickerRunId,
        recentSelections: state.recentSelections,
      }),
      merge: (persisted, current) => ({
        ...current,
        pickerBrand: typeof (persisted as Partial<PersistedPickerState>)?.pickerBrand === 'string'
          ? (persisted as Partial<PersistedPickerState>).pickerBrand!
          : current.pickerBrand,
        pickerModel: typeof (persisted as Partial<PersistedPickerState>)?.pickerModel === 'string'
          ? (persisted as Partial<PersistedPickerState>).pickerModel!
          : current.pickerModel,
        pickerProductId: typeof (persisted as Partial<PersistedPickerState>)?.pickerProductId === 'string'
          ? (persisted as Partial<PersistedPickerState>).pickerProductId!
          : current.pickerProductId,
        pickerRunId: typeof (persisted as Partial<PersistedPickerState>)?.pickerRunId === 'string'
          ? (persisted as Partial<PersistedPickerState>).pickerRunId!
          : current.pickerRunId,
        recentSelections: sanitizeRecents((persisted as Partial<PersistedPickerState>)?.recentSelections),
      }),
    },
  ),
);
