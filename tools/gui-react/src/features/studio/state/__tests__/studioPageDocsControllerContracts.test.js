import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function stableEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return Object.is(a, b);
  }
}

function createHarness(overrides = {}) {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  const harness = {
    state: {},
    refs: {},
    cursor: 0,
    effectCursor: 0,
    effectDeps: {},
    effects: [],
    needsRerender: false,
    timers: [],
    clearedTimers: [],
    authorityVersionToken: '',
    invalidateCalls: [],
    persistenceCalls: [],
    storeCalls: [],
    queryClient: { invalidateQueries() {}, refetchQueries() { return Promise.resolve(); } },
    fieldRulesStore: {
      editedRules: {},
      editedFieldOrder: [],
      pendingRenames: {},
      initialized: false,
      groupsDirty: false,
      hydrate(rules, fieldOrder) {
        harness.storeCalls.push({ kind: 'hydrate', rules, fieldOrder });
        harness.fieldRulesStore.editedRules = JSON.parse(JSON.stringify(rules));
        harness.fieldRulesStore.editedFieldOrder = [...fieldOrder];
        harness.fieldRulesStore.pendingRenames = {};
        harness.fieldRulesStore.initialized = true;
        harness.needsRerender = true;
      },
      rehydrate(rules, fieldOrder) {
        harness.storeCalls.push({ kind: 'rehydrate', rules, fieldOrder });
        harness.fieldRulesStore.editedRules = JSON.parse(JSON.stringify(rules));
        harness.fieldRulesStore.editedFieldOrder = [...fieldOrder];
        harness.fieldRulesStore.pendingRenames = {};
        harness.fieldRulesStore.initialized = true;
        harness.needsRerender = true;
      },
      reset() {
        harness.storeCalls.push({ kind: 'reset' });
        harness.fieldRulesStore.editedRules = {};
        harness.fieldRulesStore.editedFieldOrder = [];
        harness.fieldRulesStore.pendingRenames = {};
        harness.fieldRulesStore.initialized = false;
        harness.needsRerender = true;
      },
      clearRenames() {
        harness.storeCalls.push({ kind: 'clearRenames' });
        harness.fieldRulesStore.pendingRenames = {};
        harness.needsRerender = true;
      },
      clearEdited() {
        harness.storeCalls.push({ kind: 'clearEdited' });
        harness.needsRerender = true;
      },
      clearEditedKeys(keys) {
        harness.storeCalls.push({ kind: 'clearEditedKeys', keys });
        const keySet = new Set(keys);
        const cleaned = {};
        for (const [k, rule] of Object.entries(harness.fieldRulesStore.editedRules)) {
          if (keySet.has(k)) {
            const { _edited: _, ...rest } = rule;
            cleaned[k] = rest;
          } else {
            cleaned[k] = rule;
          }
        }
        harness.fieldRulesStore.editedRules = cleaned;
        harness.needsRerender = true;
      },
      clearGroupsDirty() {
        harness.storeCalls.push({ kind: 'clearGroupsDirty' });
        harness.fieldRulesStore.groupsDirty = false;
        harness.needsRerender = true;
      },
      getSnapshot() {
        return {
          rules: harness.fieldRulesStore.editedRules,
          fieldOrder: harness.fieldRulesStore.editedFieldOrder,
          renames: harness.fieldRulesStore.pendingRenames,
        };
      },
    },
    saveMapMut: {
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
      mutate(payload) {
        harness.persistenceCalls.push({ kind: 'saveMap', payload });
      },
    },
    saveStudioDocsMut: {
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
      mutate(payload, options = {}) {
        harness.persistenceCalls.push({ kind: 'saveStudioDocs', payload });
        harness.saveStudioDocsMut.isSuccess = true;
        harness.persistenceOptions?.onStudioDocsSaved?.();
        if (typeof options.onSuccess === 'function') {
          options.onSuccess();
        }
      },
    },
    ...overrides,
  };

  globalThis.__studioDocsHarness = harness;
  globalThis.setTimeout = (fn, ms) => {
    const timer = { fn, ms, id: harness.timers.length + 1 };
    harness.timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    harness.clearedTimers.push(timer);
  };

  harness.restore = () => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    delete globalThis.__studioDocsHarness;
  };

  return harness;
}

function flushEffects(harness) {
  const effects = harness.effects;
  harness.effects = [];
  for (const effect of effects) {
    effect();
  }
}

function renderHook(useStudioPageDocsController, input, harness) {
  let result;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    harness.cursor = 0;
    harness.effectCursor = 0;
    harness.needsRerender = false;
    result = useStudioPageDocsController(input);
    flushEffects(harness);
    if (!harness.needsRerender) {
      return result;
    }
  }
  throw new Error('studio docs controller hook did not stabilize');
}

async function loadStudioPageDocsControllerModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/useStudioPageDocsController.ts',
    {
      prefix: 'studio-page-docs-controller-',
      stubs: {
        react: `
          function stableEqual(a, b) {
            try {
              return JSON.stringify(a) === JSON.stringify(b);
            } catch {
              return Object.is(a, b);
            }
          }
          export function useState(initialValue) {
            const harness = globalThis.__studioDocsHarness;
            const idx = harness.cursor++;
            if (!(idx in harness.state)) {
              harness.state[idx] = typeof initialValue === 'function' ? initialValue() : initialValue;
            }
            return [
              harness.state[idx],
              (nextValue) => {
                const resolved = typeof nextValue === 'function' ? nextValue(harness.state[idx]) : nextValue;
                if (!stableEqual(harness.state[idx], resolved)) {
                  harness.state[idx] = resolved;
                  harness.needsRerender = true;
                }
              },
            ];
          }
          export function useEffect(effect) {
            const harness = globalThis.__studioDocsHarness;
            const idx = harness.effectCursor++;
            const deps = arguments.length > 1 ? arguments[1] : undefined;
            const prevDeps = harness.effectDeps[idx];
            const changed = !Array.isArray(deps)
              || !Array.isArray(prevDeps)
              || deps.length !== prevDeps.length
              || deps.some((value, depIdx) => !stableEqual(value, prevDeps[depIdx]));
            if (changed) {
              harness.effectDeps[idx] = deps;
              harness.effects.push(effect);
            }
          }
          export function useMemo(factory) {
            return factory();
          }
          export function useCallback(fn) {
            return fn;
          }
          export function useRef(initialValue) {
            const harness = globalThis.__studioDocsHarness;
            const idx = harness.cursor++;
            if (!(idx in harness.refs)) {
              harness.refs[idx] = { current: initialValue };
            }
            return harness.refs[idx];
          }
        `,
        './useFieldRulesStore.ts': `
          export function useFieldRulesStore(selector) {
            const store = globalThis.__studioDocsHarness.fieldRulesStore;
            return typeof selector === 'function' ? selector(store) : store;
          }
          useFieldRulesStore.getState = function getState() {
            return globalThis.__studioDocsHarness.fieldRulesStore;
          };
        `,
        './studioPersistenceAuthority.ts': `
          export function useStudioPersistenceAuthority(options) {
            globalThis.__studioDocsHarness.persistenceOptions = options;
            return {
              saveMapMut: globalThis.__studioDocsHarness.saveMapMut,
              saveStudioDocsMut: globalThis.__studioDocsHarness.saveStudioDocsMut,
            };
          }
        `,
        '../../../hooks/useAuthoritySnapshot.js': `
          export function useAuthoritySnapshot() {
            return {
              authorityVersionToken: globalThis.__studioDocsHarness.authorityVersionToken,
            };
          }
        `,
        '../../../hooks/authoritySnapshotHelpers.js': `
          export function buildAuthorityVersionToken(input) {
            return JSON.stringify(input);
          }
        `,
        '../../../stores/autoSaveFingerprint.ts': `
          export function autoSaveFingerprint(value) {
            return JSON.stringify(value);
          }
        `,
        '../../../stores/settingsManifest.ts': `
          export const SETTINGS_AUTOSAVE_DEBOUNCE_MS = {
            studioDocs: 25,
            studioMap: 25,
          };
          export const SETTINGS_AUTOSAVE_STATUS_MS = {
            studioSavedIndicatorReset: 25,
          };
        `,
        './invalidateFieldRulesQueries.ts': `
          export function invalidateFieldRulesQueries(queryClient, category) {
            globalThis.__studioDocsHarness.invalidateCalls.push({ queryClient, category });
          }
        `,
      },
    },
  );
}

test('useStudioPageDocsController hydrates server rules and derives autosave state from the shared view model', async () => {
  const { useStudioPageDocsController } = await loadStudioPageDocsControllerModule();
  const harness = createHarness({
    authorityVersionToken: 'auth-v1',
    queryClient: { id: 'query-client' },
  });

  try {
    const result = renderHook(
      useStudioPageDocsController,
      {
        category: 'mouse',
        rules: { dpi: { label: 'DPI' } },
        fieldOrder: ['dpi'],
        wbMap: {},
        autoSaveAllEnabled: false,
        autoSaveEnabled: true,
        autoSaveMapEnabled: false,
        mapSavedAt: '2026-03-01T00:00:00.000Z',
        compiledAt: '2026-03-02T00:00:00.000Z',
        queryClient: harness.queryClient,
      },
      harness,
    );

    assert.deepEqual(harness.storeCalls[0], {
      kind: 'hydrate',
      rules: { dpi: { label: 'DPI' } },
      fieldOrder: ['dpi'],
    });
    assert.equal(result.effectiveAutoSaveEnabled, true);
    assert.equal(result.effectiveAutoSaveMapEnabled, false);
    assert.deepEqual(result.storeFieldOrder, ['dpi']);
    assert.deepEqual(result.storeRules, { dpi: { label: 'DPI' } });
  } finally {
    harness.restore();
  }
});

test('useStudioPageDocsController opens an authority conflict when the server version changes over unsaved edits', async () => {
  const { useStudioPageDocsController } = await loadStudioPageDocsControllerModule();
  const harness = createHarness({
    authorityVersionToken: 'auth-v1',
    queryClient: { id: 'query-client' },
    fieldRulesStore: {
      editedRules: { dpi: { label: 'DPI' } },
      editedFieldOrder: ['dpi'],
      pendingRenames: {},
      initialized: true,
      groupsDirty: false,
      hydrate() {},
      rehydrate() {},
      reset() {},
      clearRenames() {},
      clearEdited() {},
      clearEditedKeys() {},
      clearGroupsDirty() {},
      getSnapshot() {
        return {
          rules: harness.fieldRulesStore.editedRules,
          fieldOrder: harness.fieldRulesStore.editedFieldOrder,
          renames: {},
        };
      },
    },
  });

  try {
    renderHook(
      useStudioPageDocsController,
      {
        category: 'mouse',
        rules: { dpi: { label: 'DPI' } },
        fieldOrder: ['dpi'],
        wbMap: {},
        autoSaveAllEnabled: false,
        autoSaveEnabled: false,
        autoSaveMapEnabled: false,
        mapSavedAt: '2026-03-01T00:00:00.000Z',
        compiledAt: '2026-03-02T00:00:00.000Z',
        queryClient: harness.queryClient,
      },
      harness,
    );

    harness.authorityVersionToken = 'auth-v2';
    harness.fieldRulesStore.editedRules = {
      dpi: { label: 'DPI', _edited: true },
    };

    const result = renderHook(
      useStudioPageDocsController,
      {
        category: 'mouse',
        rules: { dpi: { label: 'DPI' } },
        fieldOrder: ['dpi'],
        wbMap: {},
        autoSaveAllEnabled: false,
        autoSaveEnabled: false,
        autoSaveMapEnabled: false,
        mapSavedAt: '2026-03-01T00:00:00.000Z',
        compiledAt: '2026-03-02T00:00:00.000Z',
        queryClient: harness.queryClient,
      },
      harness,
    );

    assert.equal(result.authorityConflictVersion, 'auth-v2');
    assert.equal(typeof result.authorityConflictDetectedAt, 'string');
    assert.notEqual(result.authorityConflictDetectedAt, '');
  } finally {
    harness.restore();
  }
});

test('useStudioPageDocsController persists the current field-rules snapshot and supports authority reload recovery', async () => {
  const { useStudioPageDocsController } = await loadStudioPageDocsControllerModule();
  const harness = createHarness({
    authorityVersionToken: 'auth-v2',
    queryClient: { id: 'query-client', invalidateQueries() {}, refetchQueries() { return Promise.resolve(); } },
    fieldRulesStore: {
      editedRules: { dpi: { label: 'DPI', _edited: true } },
      editedFieldOrder: ['dpi'],
      pendingRenames: {},
      initialized: true,
      groupsDirty: false,
      hydrate() {},
      rehydrate(rules, fieldOrder) {
        harness.storeCalls.push({ kind: 'rehydrate', rules, fieldOrder });
        harness.fieldRulesStore.editedRules = JSON.parse(JSON.stringify(rules));
        harness.fieldRulesStore.editedFieldOrder = [...fieldOrder];
        harness.needsRerender = true;
      },
      reset() {},
      clearRenames() {
        harness.storeCalls.push({ kind: 'clearRenames' });
      },
      clearEdited() {
        harness.storeCalls.push({ kind: 'clearEdited' });
      },
      clearEditedKeys(keys) {
        harness.storeCalls.push({ kind: 'clearEditedKeys', keys });
      },
      clearGroupsDirty() {
        harness.storeCalls.push({ kind: 'clearGroupsDirty' });
      },
      getSnapshot() {
        return {
          rules: harness.fieldRulesStore.editedRules,
          fieldOrder: harness.fieldRulesStore.editedFieldOrder,
          renames: {},
        };
      },
    },
  });

  try {
    const result = renderHook(
      useStudioPageDocsController,
      {
        category: 'mouse',
        rules: { dpi: { label: 'DPI' } },
        fieldOrder: ['dpi'],
        wbMap: { selected_keys: ['dpi'] },
        autoSaveAllEnabled: false,
        autoSaveEnabled: true,
        autoSaveMapEnabled: false,
        mapSavedAt: '2026-03-01T00:00:00.000Z',
        compiledAt: '2026-03-02T00:00:00.000Z',
        queryClient: harness.queryClient,
      },
      harness,
    );

    result.saveFromStore({ force: true });
    const savedResult = renderHook(
      useStudioPageDocsController,
      {
        category: 'mouse',
        rules: { dpi: { label: 'DPI' } },
        fieldOrder: ['dpi'],
        wbMap: { selected_keys: ['dpi'] },
        autoSaveAllEnabled: false,
        autoSaveEnabled: true,
        autoSaveMapEnabled: false,
        mapSavedAt: '2026-03-01T00:00:00.000Z',
        compiledAt: '2026-03-02T00:00:00.000Z',
        queryClient: harness.queryClient,
      },
      harness,
    );

    assert.deepEqual(harness.persistenceCalls[0], {
      kind: 'saveStudioDocs',
      payload: {
        selected_keys: ['dpi'],
        field_overrides: {
          dpi: { label: 'DPI' },
        },
        field_groups: [],
      },
    });
    assert.equal(savedResult.autoSaveStatus, 'saved');

    result.reloadAuthoritySnapshot();
    const reloadedResult = renderHook(
      useStudioPageDocsController,
      {
        category: 'mouse',
        rules: { dpi: { label: 'DPI' } },
        fieldOrder: ['dpi'],
        wbMap: { selected_keys: ['dpi'] },
        autoSaveAllEnabled: false,
        autoSaveEnabled: true,
        autoSaveMapEnabled: false,
        mapSavedAt: '2026-03-01T00:00:00.000Z',
        compiledAt: '2026-03-02T00:00:00.000Z',
        queryClient: harness.queryClient,
      },
      harness,
    );

    assert.equal(reloadedResult.authorityConflictVersion, '');
    assert.equal(
      harness.storeCalls.some((entry) => entry.kind === 'rehydrate'),
      true,
    );
  } finally {
    harness.restore();
  }
});

test('save clears edit flags synchronously — no async race', async () => {
  const { useStudioPageDocsController } = await loadStudioPageDocsControllerModule();
  const harness = createHarness({
    authorityVersionToken: 'auth-v1',
    queryClient: { invalidateQueries() {}, refetchQueries() { return Promise.resolve(); } },
  });

  try {
    const input = {
      category: 'mouse',
      rules: { dpi: { label: 'DPI' } },
      fieldOrder: ['dpi'],
      wbMap: { selected_keys: ['dpi'] },
      autoSaveAllEnabled: false,
      autoSaveEnabled: true,
      autoSaveMapEnabled: false,
      mapSavedAt: '2026-03-01T00:00:00.000Z',
      compiledAt: '2026-03-02T00:00:00.000Z',
      queryClient: harness.queryClient,
    };

    renderHook(useStudioPageDocsController, input, harness);
    harness.fieldRulesStore.editedRules.dpi = { label: 'DPI', _edited: true };
    harness.storeCalls.length = 0;
    const result = renderHook(useStudioPageDocsController, input, harness);

    result.saveFromStore({ force: true });

    // clearEdited runs synchronously in the mutation callback — no await needed
    const clearCalls = harness.storeCalls.filter((c) => c.kind === 'clearEdited');
    assert.equal(clearCalls.length, 1, 'clearEdited must run synchronously after save');
  } finally {
    harness.restore();
  }
});

test('no false authority conflict dialog when version changes after own save', async () => {
  const { useStudioPageDocsController } = await loadStudioPageDocsControllerModule();
  const harness = createHarness({
    authorityVersionToken: 'auth-v1',
    queryClient: { invalidateQueries() {}, refetchQueries() { return Promise.resolve(); } },
  });

  try {
    const input = {
      category: 'mouse',
      rules: { dpi: { label: 'DPI' } },
      fieldOrder: ['dpi'],
      wbMap: { selected_keys: ['dpi'] },
      autoSaveAllEnabled: false,
      autoSaveEnabled: false,
      autoSaveMapEnabled: false,
      mapSavedAt: '2026-03-01T00:00:00.000Z',
      compiledAt: '2026-03-02T00:00:00.000Z',
      queryClient: harness.queryClient,
    };

    // Initial render — hydrate and acknowledge auth-v1
    renderHook(useStudioPageDocsController, input, harness);
    harness.fieldRulesStore.editedRules.dpi = { label: 'DPI', _edited: true };
    const result = renderHook(useStudioPageDocsController, input, harness);
    assert.equal(result.authorityConflictVersion, '', 'baseline: no conflict before save');

    // Save — clears _edited synchronously
    result.saveFromStore({ force: true });

    // Server reflects our save via authority version change
    harness.authorityVersionToken = 'auth-v2';
    const afterSaveResult = renderHook(useStudioPageDocsController, input, harness);

    assert.equal(afterSaveResult.authorityConflictVersion, '',
      'first version change after save must not show conflict');
  } finally {
    harness.restore();
  }
});

test('save failure resets save-in-progress and preserves edits', async () => {
  const { useStudioPageDocsController } = await loadStudioPageDocsControllerModule();
  const harness = createHarness({
    authorityVersionToken: 'auth-v1',
    queryClient: {
      invalidateQueries() {},
      refetchQueries() { return Promise.resolve(); },
    },
    saveStudioDocsMut: {
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
      mutate(payload, options = {}) {
        harness.persistenceCalls.push({ kind: 'saveStudioDocs', payload });
        harness.saveStudioDocsMut.isError = true;
        harness.saveStudioDocsMut.error = new Error('network failure');
        if (typeof options.onError === 'function') {
          options.onError(new Error('network failure'));
        }
      },
    },
    fieldRulesStore: {
      editedRules: { dpi: { label: 'DPI', _edited: true } },
      editedFieldOrder: ['dpi'],
      pendingRenames: {},
      initialized: true,
      groupsDirty: false,
      hydrate() {},
      rehydrate() {},
      reset() {},
      clearRenames() { harness.storeCalls.push({ kind: 'clearRenames' }); },
      clearEdited() { harness.storeCalls.push({ kind: 'clearEdited' }); },
      clearEditedKeys(keys) { harness.storeCalls.push({ kind: 'clearEditedKeys', keys }); },
      clearGroupsDirty() { harness.storeCalls.push({ kind: 'clearGroupsDirty' }); },
      getSnapshot() {
        return {
          rules: harness.fieldRulesStore.editedRules,
          fieldOrder: harness.fieldRulesStore.editedFieldOrder,
          renames: {},
        };
      },
    },
  });

  try {
    const input = {
      category: 'mouse',
      rules: { dpi: { label: 'DPI' } },
      fieldOrder: ['dpi'],
      wbMap: { selected_keys: ['dpi'] },
      autoSaveAllEnabled: false,
      autoSaveEnabled: true,
      autoSaveMapEnabled: false,
      mapSavedAt: '2026-03-01T00:00:00.000Z',
      compiledAt: '2026-03-02T00:00:00.000Z',
      queryClient: harness.queryClient,
    };

    const result = renderHook(useStudioPageDocsController, input, harness);
    result.saveFromStore({ force: true });
    await Promise.resolve();

    const clearEditedCalls = harness.storeCalls.filter((c) => c.kind === 'clearEdited' || c.kind === 'clearEditedKeys');
    assert.equal(clearEditedCalls.length, 0, 'clearEdited must not run after save failure');

    assert.equal(harness.fieldRulesStore.editedRules.dpi._edited, true,
      'edits must be preserved after save failure');
  } finally {
    harness.restore();
  }
});

test('edit after synchronous save keeps _edited flag — save cannot race with user input', async () => {
  const { useStudioPageDocsController } = await loadStudioPageDocsControllerModule();
  const harness = createHarness({
    authorityVersionToken: 'auth-v1',
    queryClient: { invalidateQueries() {}, refetchQueries() { return Promise.resolve(); } },
  });

  try {
    const input = {
      category: 'mouse',
      rules: { dpi: { label: 'DPI' }, polling_rate: { label: 'Polling Rate' } },
      fieldOrder: ['dpi', 'polling_rate'],
      wbMap: { selected_keys: ['dpi', 'polling_rate'] },
      autoSaveAllEnabled: false,
      autoSaveEnabled: true,
      autoSaveMapEnabled: false,
      mapSavedAt: '2026-03-01T00:00:00.000Z',
      compiledAt: '2026-03-02T00:00:00.000Z',
      queryClient: harness.queryClient,
    };

    renderHook(useStudioPageDocsController, input, harness);

    // Edit field A → save
    harness.fieldRulesStore.editedRules.dpi = { label: 'DPI', _edited: true };
    const result = renderHook(useStudioPageDocsController, input, harness);
    result.saveFromStore({ force: true });

    // clearEdited already ran synchronously — all _edited flags cleared
    // NOW the user edits field B
    harness.fieldRulesStore.editedRules.polling_rate = { label: 'Polling Rate', _edited: true };

    // Authority version changes (server reflects our save)
    harness.authorityVersionToken = 'auth-v2';
    const afterResult = renderHook(useStudioPageDocsController, input, harness);

    // Save-in-progress grace: no conflict for our own version change
    assert.equal(afterResult.authorityConflictVersion, '',
      'first version change after save must not conflict');

    // Field B's edit survives — it was set AFTER clearEdited ran
    assert.equal(harness.fieldRulesStore.editedRules.polling_rate._edited, true,
      'post-save edit must keep _edited flag');
  } finally {
    harness.restore();
  }
});
