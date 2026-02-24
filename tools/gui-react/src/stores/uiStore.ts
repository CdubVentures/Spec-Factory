import { create } from 'zustand';
import { coerceCategories } from '../components/layout/categoryStoreSync.js';

interface UiState {
  category: string;
  categories: string[];
  darkMode: boolean;
  autoSaveEnabled: boolean;
  autoSaveMapEnabled: boolean;
  setCategory: (cat: string) => void;
  setCategories: (cats: string[]) => void;
  toggleDarkMode: () => void;
  setAutoSaveEnabled: (v: boolean) => void;
  setAutoSaveMapEnabled: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  category: 'mouse',
  categories: coerceCategories(['mouse']),
  darkMode: false,
  autoSaveEnabled: typeof localStorage !== 'undefined' && localStorage.getItem('autoSaveEnabled') === 'true',
  autoSaveMapEnabled: typeof localStorage === 'undefined' || localStorage.getItem('autoSaveMapEnabled') !== 'false',
  setCategory: (category) => set({ category }),
  setCategories: (categories) => set({ categories: coerceCategories(categories) }),
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      document.documentElement.classList.toggle('dark', next);
      return { darkMode: next };
    }),
  setAutoSaveEnabled: (v) => {
    localStorage.setItem('autoSaveEnabled', String(v));
    set({ autoSaveEnabled: v });
  },
  setAutoSaveMapEnabled: (v) => {
    localStorage.setItem('autoSaveMapEnabled', String(v));
    set({ autoSaveMapEnabled: v });
  },
}));
