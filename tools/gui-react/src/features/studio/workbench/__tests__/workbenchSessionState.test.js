import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, withWindowStub } from '../../../../shared/test-utils/browserStorageHarness.js';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function loadWorkbenchSessionStateModule() {
  return loadBundledModule('tools/gui-react/src/features/studio/workbench/workbenchSessionState.ts', {
    prefix: 'workbench-session-state-',
  });
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
    columnVisibility: { displayName: false, requiredLevel: true, availability: 'bad' },
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

test('read/write workbench session state round-trips through sessionStorage', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadWorkbenchSessionStateModule());
  const { buildWorkbenchSessionStorageKey, readWorkbenchSessionState, writeWorkbenchSessionState } = mod;
  const key = buildWorkbenchSessionStorageKey('mouse');

  withWindowStub({ localStorage, sessionStorage }, () => {
    writeWorkbenchSessionState('mouse', {
      columnVisibility: { displayName: false, enumPolicy: true },
      sorting: [{ id: 'group', desc: false }],
      globalFilter: 'sensor',
      rowSelection: { sensor: true, weight: false },
      drawerKey: 'sensor',
    });
  });

  const raw = sessionStorage.getItem(key);
  assert.ok(typeof raw === 'string' && raw.length > 0, 'sessionStorage should contain persisted workbench state');

  const loaded = withWindowStub({ localStorage, sessionStorage }, () => readWorkbenchSessionState('mouse'));
  assert.deepEqual(loaded, {
    columnVisibility: { displayName: false, enumPolicy: true },
    sorting: [{ id: 'group', desc: false }],
    globalFilter: 'sensor',
    rowSelection: { sensor: true },
    drawerKey: 'sensor',
  });
});
