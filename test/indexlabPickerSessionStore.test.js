import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEXLAB_STORAGE_KEY = 'indexlab-store';

function createSessionStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function withWindowSessionStorage(sessionStorage, run) {
  const previousWindow = globalThis.window;
  const restore = () => {
    if (typeof previousWindow === 'undefined') {
      delete globalThis.window;
      return;
    }
    globalThis.window = previousWindow;
  };
  globalThis.window = { sessionStorage };
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

async function loadIndexlabStoreModule() {
  const esbuild = await import('esbuild');
  const srcPath = path.resolve(
    __dirname,
    '..',
    'tools',
    'gui-react',
    'src',
    'stores',
    'indexlabStore.ts',
  );
  const result = await esbuild.build({
    entryPoints: [srcPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: { '.ts': 'ts' },
  });
  const code = result.outputFiles[0].text;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indexlab-store-'));
  const tmpFile = path.join(tmpDir, 'indexlabStore.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');
  const mod = await import(`file://${tmpFile.replace(/\\/g, '/')}?v=${Date.now()}-${Math.random()}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return mod;
}

test('indexlab picker brand/model/variant/run state persists in session storage', async () => {
  const storage = createSessionStorage();
  const firstModule = await withWindowSessionStorage(storage, () => loadIndexlabStoreModule());
  const firstStore = firstModule.useIndexLabStore;

  firstStore.getState().setPickerBrand('Razer');
  firstStore.getState().setPickerModel('Viper V3 Pro');
  firstStore.getState().setPickerProductId('razer-viper-v3-pro');
  firstStore.getState().setPickerRunId('run-123');

  const raw = storage.getItem(INDEXLAB_STORAGE_KEY);
  assert.ok(typeof raw === 'string' && raw.length > 0, 'indexlab store should write persisted picker state');
  const persisted = JSON.parse(raw);
  assert.equal(persisted?.state?.pickerBrand, 'Razer');
  assert.equal(persisted?.state?.pickerModel, 'Viper V3 Pro');
  assert.equal(persisted?.state?.pickerProductId, 'razer-viper-v3-pro');
  assert.equal(persisted?.state?.pickerRunId, 'run-123');

  const secondModule = await withWindowSessionStorage(storage, () => loadIndexlabStoreModule());
  const secondState = secondModule.useIndexLabStore.getState();
  assert.equal(secondState.pickerBrand, 'Razer');
  assert.equal(secondState.pickerModel, 'Viper V3 Pro');
  assert.equal(secondState.pickerProductId, 'razer-viper-v3-pro');
  assert.equal(secondState.pickerRunId, 'run-123');
});

test('indexlab picker brand change resets model and variant selection', async () => {
  const storage = createSessionStorage();
  const mod = await withWindowSessionStorage(storage, () => loadIndexlabStoreModule());
  const store = mod.useIndexLabStore;

  store.getState().setPickerBrand('Logitech');
  store.getState().setPickerModel('G Pro X Superlight 2');
  store.getState().setPickerProductId('logitech-g-pro-x-superlight-2');
  store.getState().setPickerBrand('Pulsar');

  const state = store.getState();
  assert.equal(state.pickerBrand, 'Pulsar');
  assert.equal(state.pickerModel, '');
  assert.equal(state.pickerProductId, '');
});
