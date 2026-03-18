import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    getItem(key) {
      calls.push({ op: 'getItem', key });
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      calls.push({ op: 'setItem', key, value: String(value) });
      values.set(key, String(value));
    },
    removeItem(key) {
      calls.push({ op: 'removeItem', key });
      values.delete(key);
    },
    peek(key) {
      return values.has(key) ? values.get(key) : null;
    },
  };
}

function withWindowStorages({ sessionStorage, localStorage }, run) {
  const previousWindow = globalThis.window;
  const restore = () => {
    if (typeof previousWindow === 'undefined') {
      delete globalThis.window;
      return;
    }
    globalThis.window = previousWindow;
  };
  globalThis.window = { sessionStorage, localStorage };
  try {
    const result = run();
    if (result && typeof result === 'object' && typeof result.then === 'function') {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

async function loadGuiStoreModule(relativePath, tempPrefix) {
  const esbuild = await import('esbuild');
  const srcPath = path.resolve(__dirname, '..', 'tools', 'gui-react', 'src', ...relativePath);
  const result = await esbuild.build({
    entryPoints: [srcPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: { '.ts': 'ts' },
  });
  const code = result.outputFiles[0].text;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), tempPrefix));
  const tmpFile = path.join(tmpDir, 'store.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');
  const mod = await import(`file://${tmpFile.replace(/\\/g, '/')}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return mod;
}

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('collapse store hydrates from sessionStorage (migration) and persists to localStorage', async () => {
  // Module migrated from sessionStorage → localStorage with automatic migration.
  // Seed sessionStorage so readStorageItem migrates it to localStorage on load.
  const sessionStorage = createStorage({
    'collapse-store': JSON.stringify({
      state: { values: { sidebar: true } },
    }),
  });
  const localStorage = createStorage();
  const mod = await withWindowStorages({ sessionStorage, localStorage }, () =>
    loadGuiStoreModule(['stores', 'collapseStore.ts'], 'collapse-store-test-')
  );

  assert.equal(mod.useCollapseStore.getState().values.sidebar, true);

  await withWindowStorages({ sessionStorage, localStorage }, async () => {
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
  const mod = await withWindowStorages({ sessionStorage, localStorage }, () =>
    loadGuiStoreModule(['stores', 'tabStore.ts'], 'tab-store-test-')
  );

  assert.deepEqual(mod.useTabStore.getState().values, {
    main: 'overview',
    secondary: 'details',
  });

  await withWindowStorages({ sessionStorage, localStorage }, async () => {
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
