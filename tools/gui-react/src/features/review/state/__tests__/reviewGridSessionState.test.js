import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, withWindowStub } from '../../../../shared/test-utils/browserStorageHarness.js';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function loadReviewGridSessionStateModule() {
  return loadBundledModule('tools/gui-react/src/features/review/state/reviewGridSessionState.ts', {
    prefix: 'review-grid-session-state-',
  });
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

test('read/write review grid session state round-trips via localStorage', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadReviewGridSessionStateModule());
  const {
    buildReviewGridSessionStorageKey,
    readReviewGridSessionState,
    writeReviewGridSessionState,
  } = mod;

  withWindowStub({ localStorage, sessionStorage }, () => {
    writeReviewGridSessionState('mouse', {
      sortMode: 'flags',
      showOnlyFlagged: true,
      brandFilterMode: 'custom',
      selectedBrands: ['Logitech', 'Razer'],
    });
  });

  const key = buildReviewGridSessionStorageKey('mouse');
  const raw = localStorage.getItem(key);
  assert.ok(typeof raw === 'string' && raw.length > 0, 'review grid state should be persisted');

  const loaded = withWindowStub({ localStorage, sessionStorage }, () => readReviewGridSessionState('mouse'));
  assert.deepEqual(loaded, {
    sortMode: 'flags',
    showOnlyFlagged: true,
    brandFilterMode: 'custom',
    selectedBrands: ['Logitech', 'Razer'],
  });
});
