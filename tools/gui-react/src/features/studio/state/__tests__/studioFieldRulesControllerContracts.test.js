import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../test/helpers/loadBundledModule.js';

function createStoreHarness() {
  const storeState = {
    editedRules: { dpi: { _edited: true } },
    editedFieldOrder: ['dpi'],
    pendingRenames: { old_dpi: 'dpi' },
    initialized: true,
    hydrate() {},
    rehydrate() {},
    reset() {},
    clearRenames() {},
    updateField() {},
    addKey() {},
    removeKey() {},
    renameKey() {},
    bulkAddKeys() {},
    reorder() {},
    addGroup() {},
    removeGroup() {},
    renameGroup() {},
    getSnapshot() {
      return {
        rules: this.editedRules,
        fieldOrder: this.editedFieldOrder,
        renames: this.pendingRenames,
      };
    },
  };

  function useFieldRulesStore(selector) {
    if (typeof selector === 'function') {
      return selector(storeState);
    }
    return storeState;
  }

  useFieldRulesStore.getState = () => storeState;

  return { storeState, useFieldRulesStore };
}

async function loadStudioFieldRulesControllerModule(harness) {
  globalThis.__studioFieldRulesStoreHarness = harness.useFieldRulesStore;
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioFieldRulesController.ts',
    {
      prefix: 'studio-field-rules-controller-',
      stubs: {
        './useFieldRulesStore': `
          export const useFieldRulesStore = globalThis.__studioFieldRulesStoreHarness;
        `,
      },
    },
  );
}

test('studioFieldRulesController exposes selected state without leaking the full store object', async () => {
  const harness = createStoreHarness();
  const {
    useStudioFieldRulesState,
  } = await loadStudioFieldRulesControllerModule(harness);

  const state = useStudioFieldRulesState();

  assert.deepEqual(Object.keys(state).sort(), [
    'editedFieldOrder',
    'editedRules',
    'initialized',
    'pendingRenames',
  ]);
  assert.deepEqual(state.editedFieldOrder, ['dpi']);
  assert.equal(state.initialized, true);
});

test('studioFieldRulesController exposes mutation methods and snapshot getter through a feature contract', async () => {
  const harness = createStoreHarness();
  const {
    getStudioFieldRulesSnapshot,
    useStudioFieldRulesActions,
  } = await loadStudioFieldRulesControllerModule(harness);

  const actions = useStudioFieldRulesActions();
  const snapshot = getStudioFieldRulesSnapshot();

  assert.deepEqual(Object.keys(actions).sort(), [
    'addGroup',
    'addKey',
    'bulkAddKeys',
    'clearRenames',
    'hydrate',
    'rehydrate',
    'removeGroup',
    'removeKey',
    'renameGroup',
    'renameKey',
    'reorder',
    'reset',
    'updateField',
  ]);
  assert.deepEqual(snapshot.fieldOrder, ['dpi']);
  assert.deepEqual(snapshot.renames, { old_dpi: 'dpi' });
  assert.equal(snapshot.rules.dpi._edited, true);
});
