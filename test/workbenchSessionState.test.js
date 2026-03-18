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

async function loadWorkbenchSessionStateModule() {
  const esbuild = await import('esbuild');
  const srcPath = path.resolve(
    __dirname,
    '..',
    'tools',
    'gui-react',
    'src',
    'pages',
    'studio',
    'workbench',
    'workbenchSessionState.ts',
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-session-state-'));
  const tmpFile = path.join(tmpDir, 'workbenchSessionState.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');
  const mod = await import(`file://${tmpFile.replace(/\\/g, '/')}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return mod;
}

test('parseWorkbenchSessionState returns safe defaults for invalid payloads', async () => {
  const { parseWorkbenchSessionState } = await loadWorkbenchSessionStateModule();

  assert.deepEqual(parseWorkbenchSessionState(null), {
    columnVisibility: {},
    sorting: [],
    globalFilter: '',
    rowSelection: {},
    drawerKey: null,
  });

  assert.deepEqual(parseWorkbenchSessionState('not-json'), {
    columnVisibility: {},
    sorting: [],
    globalFilter: '',
    rowSelection: {},
    drawerKey: null,
  });
});

test('parseWorkbenchSessionState sanitizes malformed structures', async () => {
  const { parseWorkbenchSessionState } = await loadWorkbenchSessionStateModule();

  const parsed = parseWorkbenchSessionState(JSON.stringify({
    columnVisibility: { displayName: false, requiredLevel: true, effort: 'bad' },
    sorting: [
      { id: 'group', desc: true },
      { id: '', desc: false },
      { id: 123, desc: false },
      { id: 'status', desc: 'desc' },
    ],
    globalFilter: 'dpi',
    rowSelection: { dpi: true, weight: false, bad: 'yes' },
    drawerKey: 'dpi',
  }));

  assert.deepEqual(parsed, {
    columnVisibility: { displayName: false, requiredLevel: true },
    sorting: [{ id: 'group', desc: true }],
    globalFilter: 'dpi',
    rowSelection: { dpi: true },
    drawerKey: 'dpi',
  });
});

test('read/write workbench session state round-trips through localStorage', async () => {
  // Module migrated from sessionStorage → localStorage; mock must provide localStorage.
  const localStorage = createSessionStorage();
  const sessionStorage = createSessionStorage();
  const withWindow = (run) => {
    const prev = globalThis.window;
    globalThis.window = { localStorage, sessionStorage };
    try {
      const result = run();
      if (result && typeof result.then === 'function') return result.finally(() => { globalThis.window = prev; });
      globalThis.window = prev;
      return result;
    } catch (err) { globalThis.window = prev; throw err; }
  };

  const mod = await withWindow(() => loadWorkbenchSessionStateModule());
  const { buildWorkbenchSessionStorageKey, readWorkbenchSessionState, writeWorkbenchSessionState } = mod;
  const key = buildWorkbenchSessionStorageKey('mouse');

  withWindow(() => {
    writeWorkbenchSessionState('mouse', {
      columnVisibility: { displayName: false, effort: true },
      sorting: [{ id: 'group', desc: false }],
      globalFilter: 'sensor',
      rowSelection: { sensor: true, weight: false },
      drawerKey: 'sensor',
    });
  });

  const raw = localStorage.getItem(key);
  assert.ok(typeof raw === 'string' && raw.length > 0, 'localStorage should contain persisted workbench state');

  const loaded = withWindow(() => readWorkbenchSessionState('mouse'));
  assert.deepEqual(loaded, {
    columnVisibility: { displayName: false, effort: true },
    sorting: [{ id: 'group', desc: false }],
    globalFilter: 'sensor',
    rowSelection: { sensor: true },
    drawerKey: 'sensor',
  });
});
