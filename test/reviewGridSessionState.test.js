import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function loadReviewGridSessionStateModule() {
  const esbuild = await import('esbuild');
  const srcPath = path.resolve(
    __dirname,
    '..',
    'tools',
    'gui-react',
    'src',
    'pages',
    'review',
    'reviewGridSessionState.ts',
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-grid-session-state-'));
  const tmpFile = path.join(tmpDir, 'reviewGridSessionState.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');
  const mod = await import(`file://${tmpFile.replace(/\\/g, '/')}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return mod;
}

test('parseReviewGridSessionState returns safe defaults for invalid payloads', async () => {
  const { parseReviewGridSessionState } = await loadReviewGridSessionStateModule();

  assert.deepEqual(parseReviewGridSessionState(null), {
    sortMode: 'brand',
    showOnlyFlagged: false,
    brandFilterMode: 'all',
    selectedBrands: [],
  });

  assert.deepEqual(parseReviewGridSessionState('broken-json'), {
    sortMode: 'brand',
    showOnlyFlagged: false,
    brandFilterMode: 'all',
    selectedBrands: [],
  });
});

test('parseReviewGridSessionState sanitizes unknown mode values', async () => {
  const { parseReviewGridSessionState } = await loadReviewGridSessionStateModule();

  const parsed = parseReviewGridSessionState(JSON.stringify({
    sortMode: 'unsupported',
    showOnlyFlagged: true,
    brandFilterMode: 'custom',
    selectedBrands: ['Razer', '', 10, 'Pulsar', 'Razer'],
  }));

  assert.deepEqual(parsed, {
    sortMode: 'brand',
    showOnlyFlagged: true,
    brandFilterMode: 'custom',
    selectedBrands: ['Razer', 'Pulsar'],
  });
});

test('read/write review grid session state round-trips via sessionStorage', async () => {
  const storage = createSessionStorage();
  const mod = await withWindowSessionStorage(storage, () => loadReviewGridSessionStateModule());
  const {
    buildReviewGridSessionStorageKey,
    readReviewGridSessionState,
    writeReviewGridSessionState,
  } = mod;

  withWindowSessionStorage(storage, () => {
    writeReviewGridSessionState('mouse', {
      sortMode: 'flags',
      showOnlyFlagged: true,
      brandFilterMode: 'custom',
      selectedBrands: ['Logitech', 'Razer'],
    });
  });

  const key = buildReviewGridSessionStorageKey('mouse');
  const raw = storage.getItem(key);
  assert.ok(typeof raw === 'string' && raw.length > 0, 'review grid state should be persisted');

  const loaded = withWindowSessionStorage(storage, () => readReviewGridSessionState('mouse'));
  assert.deepEqual(loaded, {
    sortMode: 'flags',
    showOnlyFlagged: true,
    brandFilterMode: 'custom',
    selectedBrands: ['Logitech', 'Razer'],
  });
});
