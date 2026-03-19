import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { loadBundledModule } from './helpers/loadBundledModule.js';

// WHY: These tests prove the hydration race condition and dirty-state
// contamination bugs are fixed. The store must support three distinct
// write semantics:
//   - hydrateKeys: server-originated merge that does NOT mark dirty
//   - hydrate: full server refresh that merges onto pre-seeded values
//   - updateKeys: user-originated edit that DOES mark dirty

let store;

async function loadStore() {
  const mod = await loadBundledModule(
    'tools/gui-react/src/stores/runtimeSettingsValueStore.ts',
    { prefix: 'store-hydration-race-' },
  );
  return mod.useRuntimeSettingsValueStore;
}

function resetStore() {
  // WHY: Use partial setState (replace=false) to preserve Zustand method
  // functions while resetting only the data fields.
  store.setState({ values: null, hydrated: false, dirty: false });
}

test('setup: load store module', async () => {
  store = await loadStore();
  assert.ok(store, 'store loaded');
});

// --- hydrateKeys tests ---

test('hydrateKeys on null store sets values without marking dirty', () => {
  resetStore();

  store.getState().hydrateKeys({ llmModelPlan: 'claude-sonnet' });

  const state = store.getState();
  assert.equal(state.values.llmModelPlan, 'claude-sonnet');
  assert.equal(state.dirty, false, 'hydrateKeys must not mark dirty');
  assert.equal(state.hydrated, false, 'hydrateKeys must not mark hydrated');
});

test('hydrateKeys on hydrated store merges without dirtying', () => {
  resetStore();

  // First: full hydration
  store.getState().hydrate({ fetchTimeout: 5000, llmModelPlan: 'old' });
  assert.equal(store.getState().hydrated, true);
  assert.equal(store.getState().dirty, false);

  // Then: hydrateKeys merges without dirtying
  store.getState().hydrateKeys({ llmModelPlan: 'new-from-server' });

  const state = store.getState();
  assert.equal(state.values.llmModelPlan, 'new-from-server');
  assert.equal(state.values.fetchTimeout, 5000, 'existing keys preserved');
  assert.equal(state.dirty, false, 'hydrateKeys must not mark dirty');
  assert.equal(state.hydrated, true, 'hydrated flag preserved');
});

// --- hydrate merges onto pre-seeded values ---

test('hydrate after hydrateKeys merges both key sets', () => {
  resetStore();

  // Step 1: LLM policy seeds partial keys (race winner)
  store.getState().hydrateKeys({ llmModelPlan: 'claude-sonnet', llmMaxTokens: 4096 });
  assert.equal(store.getState().dirty, false);
  assert.equal(store.getState().hydrated, false);

  // Step 2: runtime-settings hydration arrives (race loser)
  store.getState().hydrate({ fetchTimeout: 5000, maxRetries: 3 });

  const state = store.getState();
  assert.equal(state.hydrated, true, 'hydrated after full hydrate');
  assert.equal(state.dirty, false, 'clean after hydrate');
  // Both key sets must be present
  assert.equal(state.values.llmModelPlan, 'claude-sonnet', 'LLM pre-seeded key preserved');
  assert.equal(state.values.llmMaxTokens, 4096, 'LLM pre-seeded key preserved');
  assert.equal(state.values.fetchTimeout, 5000, 'runtime key applied');
  assert.equal(state.values.maxRetries, 3, 'runtime key applied');
});

test('hydrate with full payload overwrites pre-seeded keys when both provide same key', () => {
  resetStore();

  // hydrateKeys seeds a key
  store.getState().hydrateKeys({ fetchTimeout: 9999 });

  // hydrate provides the authoritative value
  store.getState().hydrate({ fetchTimeout: 5000 });

  const state = store.getState();
  assert.equal(state.values.fetchTimeout, 5000, 'hydrate value wins for shared keys');
});

// --- updateKeys still marks dirty (existing behavior) ---

test('updateKeys marks dirty for user edits', () => {
  resetStore();

  // Hydrate first so updateKeys has a base
  store.getState().hydrate({ fetchTimeout: 5000 });
  assert.equal(store.getState().dirty, false);

  // User edit
  store.getState().updateKeys({ fetchTimeout: 10000 });

  const state = store.getState();
  assert.equal(state.dirty, true, 'updateKeys must mark dirty');
  assert.equal(state.values.fetchTimeout, 10000, 'user edit applied');
});

// --- hydrate refuses overwrite when dirty from user edits ---

test('hydrate refuses overwrite when dirty from user edits', () => {
  resetStore();

  // Hydrate with initial values
  store.getState().hydrate({ fetchTimeout: 5000, maxRetries: 3 });

  // User edits (marks dirty)
  store.getState().updateKeys({ fetchTimeout: 10000 });
  assert.equal(store.getState().dirty, true);

  // Server refresh tries to overwrite
  store.getState().hydrate({ fetchTimeout: 1, maxRetries: 1 });

  const state = store.getState();
  assert.equal(state.values.fetchTimeout, 10000, 'user edit preserved');
  assert.equal(state.values.maxRetries, 3, 'original value preserved');
});

// --- markClean resets dirty ---

test('markClean resets dirty to false', () => {
  resetStore();

  store.getState().hydrate({ fetchTimeout: 5000 });
  store.getState().updateKeys({ fetchTimeout: 10000 });
  assert.equal(store.getState().dirty, true);

  store.getState().markClean();

  assert.equal(store.getState().dirty, false, 'markClean clears dirty');
  assert.equal(store.getState().values.fetchTimeout, 10000, 'values unchanged');
});
