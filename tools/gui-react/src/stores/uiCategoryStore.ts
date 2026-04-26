import { create } from 'zustand';
import { coerceCategories, DEFAULT_CATEGORY } from '../utils/categoryStoreSync.js';
import { readPersistedValue, writePersistedValue } from './uiStoreInternal.ts';

const UI_CATEGORY_KEY = 'ui:selectedCategory';

export interface UiCategoryState {
  category: string;
  categories: string[];
  setCategory: (cat: string) => void;
  setCategories: (cats: string[]) => void;
}

const initialCategory = readPersistedValue(UI_CATEGORY_KEY) || DEFAULT_CATEGORY;

// WHY: Selected category is data-scope state — orthogonal to theme and
// settings. Splitting it into its own store keeps category-only consumers
// (most pages) free of theme/autosave selector noise.
export const useUiCategoryStore = create<UiCategoryState>((set) => ({
  category: initialCategory,
  categories: coerceCategories(['mouse']),
  setCategory: (category) => {
    writePersistedValue(UI_CATEGORY_KEY, category);
    set({ category });
  },
  setCategories: (categories) => set({ categories: coerceCategories(categories) }),
}));
