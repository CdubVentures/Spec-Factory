import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, nextTick, withWindowStub } from './helpers/browserStorageHarness.js';
import { loadBundledModule } from './helpers/loadBundledModule.js';

test('collapse store hydrates from sessionStorage (migration) and persists to localStorage', async () => {
  // Module migrated from sessionStorage → localStorage with automatic migration.
  // Seed sessionStorage so readStorageItem migrates it to localStorage on load.
  const sessionStorage = createStorage({
    'collapse-store': JSON.stringify({
      state: { values: { sidebar: true } },
    }),
  });
  const localStorage = createStorage();
  const mod = await withWindowStub({ sessionStorage, localStorage }, () =>
    loadBundledModule('tools/gui-react/src/stores/collapseStore.ts', {
      prefix: 'collapse-store-test-',
    })
  );

  assert.equal(mod.useCollapseStore.getState().values.sidebar, true);

  await withWindowStub({ sessionStorage, localStorage }, async () => {
    mod.useCollapseStore.getState().set('inspector', false);
    await nextTick();
  });

  const persisted = JSON.parse(localStorage.peek('collapse-store'));
  assert.deepEqual(persisted.state.values, {
    sidebar: true,
    inspector: false,
  });
});

test('tab store hydrates from sessionStorage (migration) and persists to localStorage', async () => {
  // Module migrated from sessionStorage → localStorage with automatic migration.
  const sessionStorage = createStorage({
    'tab-store': JSON.stringify({
      state: { values: { main: 'overview', secondary: 'details' } },
    }),
  });
  const localStorage = createStorage();
  const mod = await withWindowStub({ sessionStorage, localStorage }, () =>
    loadBundledModule('tools/gui-react/src/stores/tabStore.ts', {
      prefix: 'tab-store-test-',
    })
  );

  assert.deepEqual(mod.useTabStore.getState().values, {
    main: 'overview',
    secondary: 'details',
  });

  await withWindowStub({ sessionStorage, localStorage }, async () => {
    mod.useTabStore.getState().set('panel', 'search');
    mod.useTabStore.getState().clear('main');
    await nextTick();
  });

  const persisted = JSON.parse(localStorage.peek('tab-store'));
  assert.deepEqual(persisted.state.values, {
    secondary: 'details',
    panel: 'search',
  });
});
