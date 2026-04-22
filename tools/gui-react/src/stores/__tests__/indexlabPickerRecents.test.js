import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, withWindowStub } from '../../shared/test-utils/browserStorageHarness.js';
import { loadBundledModule } from '../../../../../src/shared/tests/helpers/loadBundledModule.js';

const INDEXLAB_STORAGE_KEY = 'indexlab-store';

function loadIndexlabStoreModule() {
  return loadBundledModule('tools/gui-react/src/stores/indexlabStore.ts', {
    prefix: 'indexlab-store-recents-',
  });
}

function makeEntry(overrides = {}) {
  return {
    productId: 'razer-viper-v2-pro-white',
    brand: 'Razer',
    model: 'Viper V2 Pro',
    variant: 'White',
    at: 1000,
    ...overrides,
  };
}

test('pushRecent adds an entry to the front', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  const store = mod.useIndexLabStore;

  store.getState().pushRecent(makeEntry({ productId: 'a' }));
  store.getState().pushRecent(makeEntry({ productId: 'b' }));

  const state = store.getState();
  assert.equal(state.recentSelections.length, 2);
  assert.equal(state.recentSelections[0].productId, 'b');
  assert.equal(state.recentSelections[1].productId, 'a');
});

test('pushRecent dedupes by productId, moving existing entry to front', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  const store = mod.useIndexLabStore;

  store.getState().pushRecent(makeEntry({ productId: 'a' }));
  store.getState().pushRecent(makeEntry({ productId: 'b' }));
  store.getState().pushRecent(makeEntry({ productId: 'a' }));

  const state = store.getState();
  assert.equal(state.recentSelections.length, 2);
  assert.equal(state.recentSelections[0].productId, 'a');
  assert.equal(state.recentSelections[1].productId, 'b');
});

test('pushRecent caps recents at 6 entries (LRU eviction)', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  const store = mod.useIndexLabStore;

  for (let i = 1; i <= 8; i += 1) {
    store.getState().pushRecent(makeEntry({ productId: `p-${i}` }));
  }

  const state = store.getState();
  assert.equal(state.recentSelections.length, 6);
  assert.equal(state.recentSelections[0].productId, 'p-8');
  assert.equal(state.recentSelections[5].productId, 'p-3');
});

test('pushRecent ignores empty productId', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  const store = mod.useIndexLabStore;

  store.getState().pushRecent(makeEntry({ productId: '' }));
  store.getState().pushRecent(makeEntry({ productId: '   ' }));

  assert.equal(store.getState().recentSelections.length, 0);
});

test('clearRecents empties the list', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  const store = mod.useIndexLabStore;

  store.getState().pushRecent(makeEntry({ productId: 'a' }));
  store.getState().pushRecent(makeEntry({ productId: 'b' }));
  store.getState().clearRecents();

  assert.equal(store.getState().recentSelections.length, 0);
});

test('recentSelections persists across reloads', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const firstModule = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  firstModule.useIndexLabStore.getState().pushRecent(makeEntry({ productId: 'p-1', brand: 'Razer' }));
  firstModule.useIndexLabStore.getState().pushRecent(makeEntry({ productId: 'p-2', brand: 'Pulsar' }));

  const raw = localStorage.getItem(INDEXLAB_STORAGE_KEY);
  assert.ok(typeof raw === 'string' && raw.length > 0);
  const persisted = JSON.parse(raw);
  assert.equal(persisted.state.recentSelections.length, 2);
  assert.equal(persisted.state.recentSelections[0].productId, 'p-2');

  const secondModule = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  const state = secondModule.useIndexLabStore.getState();
  assert.equal(state.recentSelections.length, 2);
  assert.equal(state.recentSelections[0].productId, 'p-2');
  assert.equal(state.recentSelections[0].brand, 'Pulsar');
});

test('setPickerProductId does NOT auto-push to recents (separate concern)', async () => {
  // WHY: pushRecent is called explicitly by the picker component, not as a side
  // effect of setPickerProductId. Recents is session history, not raw state echo.
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  const store = mod.useIndexLabStore;

  store.getState().setPickerProductId('razer-viper-v2-pro-white');

  assert.equal(store.getState().recentSelections.length, 0);
});

test('clearing picker productId does not wipe recents', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  const store = mod.useIndexLabStore;

  store.getState().pushRecent(makeEntry({ productId: 'a' }));
  store.getState().setPickerProductId('');

  assert.equal(store.getState().recentSelections.length, 1);
});
