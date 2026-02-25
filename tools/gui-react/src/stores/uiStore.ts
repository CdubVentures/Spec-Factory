import { create } from 'zustand';
import { coerceCategories } from '../components/layout/categoryStoreSync.js';
import { UI_SETTING_DEFAULTS } from './settingsManifest';

const UI_CATEGORY_KEY = 'ui:selectedCategory';
const RUNTIME_AUTOSAVE_KEY = 'indexlab-runtime-autosave';
const LLM_SETTINGS_AUTOSAVE_KEY = 'llmSettings:autoSaveEnabled';
const STUDIO_AUTOSAVE_ALL_KEY = 'studio:autoSaveAllEnabled';
const STUDIO_AUTOSAVE_KEY = 'autoSaveEnabled';
const STUDIO_MAP_AUTOSAVE_KEY = 'autoSaveMapEnabled';
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

interface StudioAutoSaveState {
  autoSaveAllEnabled: boolean;
  autoSaveEnabled: boolean;
  autoSaveMapEnabled: boolean;
}

function normalizeStudioAutoSaveState(state: StudioAutoSaveState): StudioAutoSaveState {
  const autoSaveAllEnabled = Boolean(state.autoSaveAllEnabled);
  const autoSaveMapEnabled = autoSaveAllEnabled ? true : Boolean(state.autoSaveMapEnabled);
  const autoSaveEnabled = autoSaveAllEnabled || autoSaveMapEnabled
    ? true
    : Boolean(state.autoSaveEnabled);
  return {
    autoSaveAllEnabled,
    autoSaveEnabled,
    autoSaveMapEnabled,
  };
}

function persistStudioAutoSaveState(state: StudioAutoSaveState): void {
  writeSessionValue(STUDIO_AUTOSAVE_ALL_KEY, String(state.autoSaveAllEnabled));
  writeSessionValue(STUDIO_AUTOSAVE_KEY, String(state.autoSaveEnabled));
  writeSessionValue(STUDIO_MAP_AUTOSAVE_KEY, String(state.autoSaveMapEnabled));
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
const initialStudioAutoSaveState = normalizeStudioAutoSaveState({
  autoSaveAllEnabled: readSessionBool(STUDIO_AUTOSAVE_ALL_KEY, UI_SETTING_DEFAULTS.studioAutoSaveAllEnabled),
  autoSaveEnabled: readSessionBool(STUDIO_AUTOSAVE_KEY, UI_SETTING_DEFAULTS.studioAutoSaveEnabled),
  autoSaveMapEnabled: readSessionBool(STUDIO_MAP_AUTOSAVE_KEY, UI_SETTING_DEFAULTS.studioAutoSaveMapEnabled),
});
persistStudioAutoSaveState(initialStudioAutoSaveState);

export const useUiStore = create<UiState>((set) => ({
  category: initialCategory,
  categories: coerceCategories(['mouse']),
  darkMode: false,
  autoSaveAllEnabled: initialStudioAutoSaveState.autoSaveAllEnabled,
  autoSaveEnabled: initialStudioAutoSaveState.autoSaveEnabled,
  autoSaveMapEnabled: initialStudioAutoSaveState.autoSaveMapEnabled,
  runtimeAutoSaveEnabled: readSessionBool(RUNTIME_AUTOSAVE_KEY, UI_SETTING_DEFAULTS.runtimeAutoSaveEnabled),
  storageAutoSaveEnabled: readSessionBool(STORAGE_AUTOSAVE_KEY, UI_SETTING_DEFAULTS.storageAutoSaveEnabled),
  llmSettingsAutoSaveEnabled: readSessionBool(LLM_SETTINGS_AUTOSAVE_KEY, UI_SETTING_DEFAULTS.llmSettingsAutoSaveEnabled),
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
  setAutoSaveAllEnabled: (v) =>
    set((state) => {
      const nextStudioAutoSaveState = normalizeStudioAutoSaveState({
        autoSaveAllEnabled: v,
        autoSaveEnabled: state.autoSaveEnabled,
        autoSaveMapEnabled: state.autoSaveMapEnabled,
      });
      persistStudioAutoSaveState(nextStudioAutoSaveState);
      return nextStudioAutoSaveState;
    }),
  setAutoSaveEnabled: (v) => {
    set((state) => {
      const nextStudioAutoSaveState = normalizeStudioAutoSaveState({
        autoSaveAllEnabled: state.autoSaveAllEnabled,
        autoSaveEnabled: v,
        autoSaveMapEnabled: state.autoSaveMapEnabled,
      });
      persistStudioAutoSaveState(nextStudioAutoSaveState);
      return {
        autoSaveEnabled: nextStudioAutoSaveState.autoSaveEnabled,
        autoSaveMapEnabled: nextStudioAutoSaveState.autoSaveMapEnabled,
      };
    });
  },
  setAutoSaveMapEnabled: (v) => {
    set((state) => {
      const nextStudioAutoSaveState = normalizeStudioAutoSaveState({
        autoSaveAllEnabled: state.autoSaveAllEnabled,
        autoSaveEnabled: state.autoSaveEnabled,
        autoSaveMapEnabled: v,
      });
      persistStudioAutoSaveState(nextStudioAutoSaveState);
      return {
        autoSaveEnabled: nextStudioAutoSaveState.autoSaveEnabled,
        autoSaveMapEnabled: nextStudioAutoSaveState.autoSaveMapEnabled,
      };
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
