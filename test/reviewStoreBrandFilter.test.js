import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadReviewStoreModule() {
  const esbuild = await import('esbuild');
  const srcPath = path.resolve(
    __dirname,
    '..',
    'tools',
    'gui-react',
    'src',
    'stores',
    'reviewStore.ts',
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-store-'));
  const tmpFile = path.join(tmpDir, 'reviewStore.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');
  const mod = await import(`file://${tmpFile.replace(/\\/g, '/')}?v=${Date.now()}-${Math.random()}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return mod;
}

test('review store can set custom brand filter selection explicitly', async () => {
  const mod = await loadReviewStoreModule();
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
  const mod = await loadReviewStoreModule();
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
