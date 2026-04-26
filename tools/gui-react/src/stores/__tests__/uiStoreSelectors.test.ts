import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { selectSidebarCategoryState } from '../uiStoreSelectors.ts';
import type { UiCategoryState } from '../uiCategoryStore.ts';

function createCategoryState(overrides: Partial<UiCategoryState> = {}): UiCategoryState {
  return {
    category: 'mouse',
    categories: ['mouse', 'keyboard'],
    setCategory() {},
    setCategories() {},
    ...overrides,
  };
}

describe('ui store selectors', () => {
  it('selects sidebar category state without theme or autosave fields', () => {
    const state = createCategoryState();

    assert.deepEqual(selectSidebarCategoryState(state), {
      category: 'mouse',
      categories: ['mouse', 'keyboard'],
      setCategory: state.setCategory,
    });
  });
});
