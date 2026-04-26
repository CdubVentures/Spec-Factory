import type { UiCategoryState } from './uiCategoryStore.ts';

// Single-domain selectors. Theme + settings consumers now subscribe to their
// own dedicated stores (uiThemeStore, uiSettingsStore) — no aggregate selector
// is needed there.
export function selectSidebarCategoryState(state: UiCategoryState) {
  return {
    category: state.category,
    categories: state.categories,
    setCategory: state.setCategory,
  };
}
