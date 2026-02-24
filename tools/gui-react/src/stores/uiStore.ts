import { create } from 'zustand';
import { coerceCategories } from '../components/layout/categoryStoreSync.js';

const UI_CATEGORY_KEY = 'ui:selectedCategory';
const RUNTIME_AUTOSAVE_KEY = 'indexlab-runtime-autosave';
const LLM_SETTINGS_AUTOSAVE_KEY = 'llmSettings:autoSaveEnabled';
const STUDIO_AUTOSAVE_ALL_KEY = 'studio:autoSaveAllEnabled';
const STORAGE_AUTOSAVE_KEY = 'storage:autoSaveEnabled';
const DEFAULT_CATEGORY = 'mouse';

function readSessionBool(key: string, fallback: boolean): boolean {
  const value = readSessionValue(key);
  if (!value) return fallback;
  return value === 'true';
}

function readSessionValue(key: string): string {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeSessionValue(key: string, value: string) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    return;
  }
}

interface UiState {
  category: string;
  categories: string[];
  darkMode: boolean;
  autoSaveAllEnabled: boolean;
  autoSaveEnabled: boolean;
  autoSaveMapEnabled: boolean;
  runtimeAutoSaveEnabled: boolean;
  storageAutoSaveEnabled: boolean;
  llmSettingsAutoSaveEnabled: boolean;
  setCategory: (cat: string) => void;
  setCategories: (cats: string[]) => void;
  toggleDarkMode: () => void;
  setAutoSaveAllEnabled: (v: boolean) => void;
  setAutoSaveEnabled: (v: boolean) => void;
  setAutoSaveMapEnabled: (v: boolean) => void;
  setRuntimeAutoSaveEnabled: (v: boolean) => void;
  setStorageAutoSaveEnabled: (v: boolean) => void;
  setLlmSettingsAutoSaveEnabled: (v: boolean) => void;
}

const initialCategory = readSessionValue(UI_CATEGORY_KEY) || DEFAULT_CATEGORY;

export const useUiStore = create<UiState>((set) => ({
  category: initialCategory,
  categories: coerceCategories(['mouse']),
  darkMode: false,
  autoSaveAllEnabled: readSessionBool(STUDIO_AUTOSAVE_ALL_KEY, false),
  autoSaveEnabled: readSessionBool('autoSaveEnabled', false),
  autoSaveMapEnabled: readSessionBool('autoSaveMapEnabled', true),
  runtimeAutoSaveEnabled: readSessionBool(RUNTIME_AUTOSAVE_KEY, true),
  storageAutoSaveEnabled: readSessionBool(STORAGE_AUTOSAVE_KEY, false),
  llmSettingsAutoSaveEnabled: readSessionBool(LLM_SETTINGS_AUTOSAVE_KEY, true),
  setCategory: (category) => {
    writeSessionValue(UI_CATEGORY_KEY, category);
    set({ category });
  },
  setCategories: (categories) => set({ categories: coerceCategories(categories) }),
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      document.documentElement.classList.toggle('dark', next);
      return { darkMode: next };
    }),
  setAutoSaveAllEnabled: (v) => {
    writeSessionValue(STUDIO_AUTOSAVE_ALL_KEY, String(v));
    if (v) {
      writeSessionValue('autoSaveEnabled', 'true');
      writeSessionValue('autoSaveMapEnabled', 'true');
    }
    set((state) => ({
      autoSaveAllEnabled: v,
      autoSaveEnabled: v ? true : state.autoSaveEnabled,
      autoSaveMapEnabled: v ? true : state.autoSaveMapEnabled,
    }));
  },
  setAutoSaveEnabled: (v) => {
    set((state) => {
      const next = state.autoSaveAllEnabled ? true : v;
      writeSessionValue('autoSaveEnabled', String(next));
      return { autoSaveEnabled: next };
    });
  },
  setAutoSaveMapEnabled: (v) => {
    set((state) => {
      const next = state.autoSaveAllEnabled ? true : v;
      writeSessionValue('autoSaveMapEnabled', String(next));
      return { autoSaveMapEnabled: next };
    });
  },
  setRuntimeAutoSaveEnabled: (v) => {
    writeSessionValue(RUNTIME_AUTOSAVE_KEY, String(v));
    set({ runtimeAutoSaveEnabled: v });
  },
  setStorageAutoSaveEnabled: (v) => {
    writeSessionValue(STORAGE_AUTOSAVE_KEY, String(v));
    set({ storageAutoSaveEnabled: v });
  },
  setLlmSettingsAutoSaveEnabled: (v) => {
    writeSessionValue(LLM_SETTINGS_AUTOSAVE_KEY, String(v));
    set({ llmSettingsAutoSaveEnabled: v });
  },
}));
