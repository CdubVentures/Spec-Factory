import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

test('review store can set custom brand filter selection explicitly', async () => {
  const mod = await loadBundledModule('tools/gui-react/src/features/review/state/reviewStore.ts', {
    prefix: 'review-store-',
  });
  const store = mod.useReviewStore;

  store.setState({
    availableBrands: [],
    brandFilter: { mode: 'all', selected: new Set() },
  });

  store.getState().setAvailableBrands(['Razer', 'Pulsar', 'Logitech']);
  store.getState().setBrandFilterSelection(['Razer', 'Pulsar']);

  const state = store.getState();
  assert.equal(state.brandFilter.mode, 'custom');
  assert.deepEqual(Array.from(state.brandFilter.selected).sort(), ['Pulsar', 'Razer']);
});

test('available brands update prunes custom brand selection and normalizes mode', async () => {
  const mod = await loadBundledModule('tools/gui-react/src/features/review/state/reviewStore.ts', {
    prefix: 'review-store-',
  });
  const store = mod.useReviewStore;

  store.setState({
    availableBrands: [],
    brandFilter: { mode: 'all', selected: new Set() },
  });

  store.getState().setAvailableBrands(['Razer', 'Pulsar', 'Logitech']);
  store.getState().setBrandFilterSelection(['Razer', 'Unknown']);
  store.getState().setAvailableBrands(['Pulsar', 'Logitech']);

  const state = store.getState();
  assert.equal(state.brandFilter.mode, 'none');
  assert.deepEqual(Array.from(state.brandFilter.selected), []);
});
