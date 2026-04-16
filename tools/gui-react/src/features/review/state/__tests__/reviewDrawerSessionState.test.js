import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, withWindowStub } from '../../../../shared/test-utils/browserStorageHarness.js';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function loadModule() {
  return loadBundledModule('tools/gui-react/src/features/review/state/reviewDrawerSessionState.ts', {
    prefix: 'review-drawer-session-state-',
  });
}

test('parseReviewDrawerSessionState returns defaults for null/undefined', async () => {
  const { parseReviewDrawerSessionState } = await loadModule();

  assert.deepEqual(parseReviewDrawerSessionState(null), {
    drawerOpen: false,
    productId: '',
    field: '',
  });

  assert.deepEqual(parseReviewDrawerSessionState(undefined), {
    drawerOpen: false,
    productId: '',
    field: '',
  });

  assert.deepEqual(parseReviewDrawerSessionState(''), {
    drawerOpen: false,
    productId: '',
    field: '',
  });
});

test('parseReviewDrawerSessionState returns defaults for broken JSON', async () => {
  const { parseReviewDrawerSessionState } = await loadModule();

  assert.deepEqual(parseReviewDrawerSessionState('not-json'), {
    drawerOpen: false,
    productId: '',
    field: '',
  });
});

test('parseReviewDrawerSessionState sanitizes non-string productId/field', async () => {
  const { parseReviewDrawerSessionState } = await loadModule();

  const parsed = parseReviewDrawerSessionState(JSON.stringify({
    drawerOpen: true,
    productId: 42,
    field: null,
  }));

  assert.deepEqual(parsed, {
    drawerOpen: true,
    productId: '',
    field: '',
  });
});

test('parseReviewDrawerSessionState preserves valid state', async () => {
  const { parseReviewDrawerSessionState } = await loadModule();

  const parsed = parseReviewDrawerSessionState(JSON.stringify({
    drawerOpen: true,
    productId: 'mouse-razer-viper-v3',
    field: 'weight',
  }));

  assert.deepEqual(parsed, {
    drawerOpen: true,
    productId: 'mouse-razer-viper-v3',
    field: 'weight',
  });
});

test('parseReviewDrawerSessionState coerces drawerOpen to boolean', async () => {
  const { parseReviewDrawerSessionState } = await loadModule();

  assert.equal(
    parseReviewDrawerSessionState(JSON.stringify({ drawerOpen: 'yes' })).drawerOpen,
    false,
  );
  assert.equal(
    parseReviewDrawerSessionState(JSON.stringify({ drawerOpen: 1 })).drawerOpen,
    false,
  );
  assert.equal(
    parseReviewDrawerSessionState(JSON.stringify({ drawerOpen: true })).drawerOpen,
    true,
  );
});

test('read/write round-trips via localStorage', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadModule());
  const {
    buildReviewDrawerStorageKey,
    readReviewDrawerSessionState,
    writeReviewDrawerSessionState,
  } = mod;

  withWindowStub({ localStorage, sessionStorage }, () => {
    writeReviewDrawerSessionState('mouse', {
      drawerOpen: true,
      productId: 'mouse-razer-viper-v3',
      field: 'weight',
    });
  });

  const key = buildReviewDrawerStorageKey('mouse');
  const raw = localStorage.getItem(key);
  assert.ok(typeof raw === 'string' && raw.length > 0, 'drawer state should be persisted');

  const loaded = withWindowStub({ localStorage, sessionStorage }, () =>
    readReviewDrawerSessionState('mouse'),
  );
  assert.deepEqual(loaded, {
    drawerOpen: true,
    productId: 'mouse-razer-viper-v3',
    field: 'weight',
  });
});

test('readReviewDrawerSessionState migrates from sessionStorage', async () => {
  const key = 'review:drawer:sessionState:mouse';
  const sessionStorage = createStorage({
    [key]: JSON.stringify({ drawerOpen: true, productId: 'p1', field: 'f1' }),
  }, { trackCalls: false });
  const localStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadModule());
  const { readReviewDrawerSessionState } = mod;

  const loaded = withWindowStub({ localStorage, sessionStorage }, () =>
    readReviewDrawerSessionState('mouse'),
  );

  assert.deepEqual(loaded, { drawerOpen: true, productId: 'p1', field: 'f1' });
  assert.ok(localStorage.getItem(key) !== null, 'should migrate to localStorage');
  assert.equal(sessionStorage.getItem(key), null, 'should remove from sessionStorage');
});

test('writeReviewDrawerSessionState sanitizes before writing', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadModule());
  const { readReviewDrawerSessionState, writeReviewDrawerSessionState } = mod;

  withWindowStub({ localStorage, sessionStorage }, () => {
    writeReviewDrawerSessionState('mouse', {
      drawerOpen: 'truthy',
      productId: 123,
      field: '',
    });
  });

  const loaded = withWindowStub({ localStorage, sessionStorage }, () =>
    readReviewDrawerSessionState('mouse'),
  );
  assert.equal(loaded.drawerOpen, false, 'non-boolean drawerOpen should be coerced to false');
  assert.equal(loaded.productId, '', 'non-string productId should be coerced to empty');
});
