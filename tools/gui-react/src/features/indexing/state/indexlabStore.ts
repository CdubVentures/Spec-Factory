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

interface IndexLabState {
  byRun: Record<string, IndexLabEvent[]>;
  appendEvents: (events: IndexLabEvent[]) => void;
  clearRun: (runId: string) => void;
  clearAll: () => void;

  pickerBrand: string;
  pickerModel: string;
  pickerProductId: string;
  pickerRunId: string;
  setPickerBrand: (brand: string) => void;
  setPickerModel: (model: string) => void;
  setPickerProductId: (productId: string) => void;
  setPickerRunId: (runId: string) => void;
}

const MAX_PER_RUN = 4000;
const STORAGE_KEY = 'indexlab-store';

type PersistedPickerState = Pick<IndexLabState, 'pickerBrand' | 'pickerModel' | 'pickerProductId' | 'pickerRunId'>;

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

function readStorageItem(name: string) {
  if (typeof window === 'undefined') return null;
  try {
    const local = window.localStorage?.getItem(name) ?? null;
    if (local) return local;
    const session = window.sessionStorage?.getItem(name) ?? null;
    if (session) {
      window.localStorage?.setItem(name, session);
      window.sessionStorage?.removeItem(name);
    }
    return session;
  } catch {
    return null;
  }
}

function loadInitialPickerState(): PersistedPickerState {
  const defaults: PersistedPickerState = {
    pickerBrand: '',
    pickerModel: '',
    pickerProductId: '',
    pickerRunId: '',
  };
  try {
    const raw = readStorageItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const values = parsed?.state;
    return {
      pickerBrand: typeof values?.pickerBrand === 'string' ? values.pickerBrand : '',
      pickerModel: typeof values?.pickerModel === 'string' ? values.pickerModel : '',
      pickerProductId: typeof values?.pickerProductId === 'string' ? values.pickerProductId : '',
      pickerRunId: typeof values?.pickerRunId === 'string' ? values.pickerRunId : '',
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
    }),
    {
      name: STORAGE_KEY,
      storage,
      partialize: (state) => ({
        pickerBrand: state.pickerBrand,
        pickerModel: state.pickerModel,
        pickerProductId: state.pickerProductId,
        pickerRunId: state.pickerRunId,
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
      }),
    },
  ),
);
