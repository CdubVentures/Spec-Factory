import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBundledModule } from '../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function createStoreHarness() {
  const mod = await loadBundledModule(
    'tools/gui-react/src/stores/runtimeSettingsValueStore.ts',
    { prefix: 'store-hydration-race-' },
  );
  const store = mod.useRuntimeSettingsValueStore;
  store.setState({ values: null, hydrated: false, dirty: false, flushPending: false });
  return store;
}

test('hydrateKeys seeds values without marking the store dirty', async () => {
  const store = await createStoreHarness();

  store.getState().hydrateKeys({ llmModelPlan: 'claude-sonnet' });

  const state = store.getState();
  assert.equal(state.values.llmModelPlan, 'claude-sonnet');
  assert.equal(state.dirty, false);
  assert.equal(state.hydrated, false);
});

test('hydrateKeys merges server keys onto an already hydrated store', async () => {
  const store = await createStoreHarness();

  store.getState().hydrate({ fetchTimeout: 5000, llmModelPlan: 'old' });
  store.getState().hydrateKeys({ llmModelPlan: 'new-from-server' });

  const state = store.getState();
  assert.equal(state.values.llmModelPlan, 'new-from-server');
  assert.equal(state.values.fetchTimeout, 5000);
  assert.equal(state.dirty, false);
  assert.equal(state.hydrated, true);
});

test('hydrate preserves pre-seeded keys while applying runtime settings', async () => {
  const store = await createStoreHarness();

  store.getState().hydrateKeys({ llmModelPlan: 'claude-sonnet', llmMaxTokens: 4096 });
  store.getState().hydrate({ fetchTimeout: 5000, maxRetries: 3 });

  const state = store.getState();
  assert.equal(state.values.llmModelPlan, 'claude-sonnet');
  assert.equal(state.values.llmMaxTokens, 4096);
  assert.equal(state.values.fetchTimeout, 5000);
  assert.equal(state.values.maxRetries, 3);
  assert.equal(state.dirty, false);
  assert.equal(state.hydrated, true);
});

test('hydrate overwrites pre-seeded keys when the runtime payload carries the same key', async () => {
  const store = await createStoreHarness();

  store.getState().hydrateKeys({ fetchTimeout: 9999 });
  store.getState().hydrate({ fetchTimeout: 5000 });

  assert.equal(store.getState().values.fetchTimeout, 5000);
});

test('updateKeys marks the store dirty for user edits', async () => {
  const store = await createStoreHarness();

  store.getState().hydrate({ fetchTimeout: 5000 });
  store.getState().updateKeys({ fetchTimeout: 10000 });

  const state = store.getState();
  assert.equal(state.dirty, true);
  assert.equal(state.values.fetchTimeout, 10000);
});

test('hydrate does not overwrite user edits after the store becomes dirty', async () => {
  const store = await createStoreHarness();

  store.getState().hydrate({ fetchTimeout: 5000, maxRetries: 3 });
  store.getState().updateKeys({ fetchTimeout: 10000 });
  store.getState().hydrate({ fetchTimeout: 1, maxRetries: 1 });

  const state = store.getState();
  assert.equal(state.values.fetchTimeout, 10000);
  assert.equal(state.values.maxRetries, 3);
  assert.equal(state.dirty, true);
});

test('markClean clears dirty without changing stored values', async () => {
  const store = await createStoreHarness();

  store.getState().hydrate({ fetchTimeout: 5000 });
  store.getState().updateKeys({ fetchTimeout: 10000 });
  store.getState().markClean();

  const state = store.getState();
  assert.equal(state.dirty, false);
  assert.equal(state.values.fetchTimeout, 10000);
});

// WHY: flushPending lifecycle tests — SET-005 fix.
// When unmount flush fires (teardownFetch keepalive), dirty clears but
// flushPending blocks hydrate until the server confirms via WS event.

test('flushPending blocks hydrate like dirty does', async () => {
  const store = await createStoreHarness();

  store.getState().hydrate({ fetchTimeout: 5000 });
  store.getState().markFlushPending();

  // Stale server data should be blocked
  store.getState().hydrate({ fetchTimeout: 1 });

  assert.equal(store.getState().values.fetchTimeout, 5000);
  assert.equal(store.getState().flushPending, true);
  assert.equal(store.getState().dirty, false);
});

test('confirmFlush unblocks hydrate after server confirms', async () => {
  const store = await createStoreHarness();

  store.getState().hydrate({ fetchTimeout: 5000 });
  store.getState().markFlushPending();
  store.getState().confirmFlush();

  // Fresh server data should apply
  store.getState().hydrate({ fetchTimeout: 9999 });

  assert.equal(store.getState().values.fetchTimeout, 9999);
  assert.equal(store.getState().flushPending, false);
});

test('markClean clears both dirty and flushPending', async () => {
  const store = await createStoreHarness();

  store.getState().hydrate({ fetchTimeout: 5000 });
  store.getState().updateKeys({ fetchTimeout: 10000 });
  store.getState().markFlushPending();

  assert.equal(store.getState().dirty, false);
  assert.equal(store.getState().flushPending, true);

  store.getState().markClean();

  assert.equal(store.getState().dirty, false);
  assert.equal(store.getState().flushPending, false);
});
