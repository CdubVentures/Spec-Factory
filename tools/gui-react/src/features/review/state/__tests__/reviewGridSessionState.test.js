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
    brandFilterMode: 'all',
    selectedBrands: [],
    confidenceFilter: 'all',
    coverageFilter: 'all',
    runStatusFilter: 'all',
  });

  assert.deepEqual(parseReviewGridSessionState('broken-json'), {
    sortMode: 'brand',
    brandFilterMode: 'all',
    selectedBrands: [],
    confidenceFilter: 'all',
    coverageFilter: 'all',
    runStatusFilter: 'all',
  });
});

test('parseReviewGridSessionState sanitizes unknown mode values', async () => {
  const { parseReviewGridSessionState } = await loadReviewGridSessionStateModule();

  const parsed = parseReviewGridSessionState(JSON.stringify({
    sortMode: 'unsupported',
    brandFilterMode: 'custom',
    selectedBrands: ['Razer', '', 10, 'Pulsar', 'Razer'],
  }));

  assert.deepEqual(parsed, {
    sortMode: 'brand',
    brandFilterMode: 'custom',
    selectedBrands: ['Razer', 'Pulsar'],
    confidenceFilter: 'all',
    coverageFilter: 'all',
    runStatusFilter: 'all',
  });
});

test('read/write review grid session state round-trips via sessionStorage', async () => {
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
      sortMode: 'confidence',
      brandFilterMode: 'custom',
      selectedBrands: ['Logitech', 'Razer'],
    });
  });

  const key = buildReviewGridSessionStorageKey('mouse');
  const raw = sessionStorage.getItem(key);
  assert.ok(typeof raw === 'string' && raw.length > 0, 'review grid state should be persisted');

  const loaded = withWindowStub({ localStorage, sessionStorage }, () => readReviewGridSessionState('mouse'));
  assert.deepEqual(loaded, {
    sortMode: 'confidence',
    brandFilterMode: 'custom',
    selectedBrands: ['Logitech', 'Razer'],
    confidenceFilter: 'all',
    coverageFilter: 'all',
    runStatusFilter: 'all',
  });
});

test('parseReviewGridSessionState preserves valid filter values', async () => {
  const { parseReviewGridSessionState } = await loadReviewGridSessionStateModule();

  const parsed = parseReviewGridSessionState(JSON.stringify({
    sortMode: 'brand',
    brandFilterMode: 'all',
    selectedBrands: [],
    confidenceFilter: 'high',
    coverageFilter: 'sparse',
    runStatusFilter: 'ran',
  }));

  assert.equal(parsed.confidenceFilter, 'high');
  assert.equal(parsed.coverageFilter, 'sparse');
  assert.equal(parsed.runStatusFilter, 'ran');
});

test('parseReviewGridSessionState sanitizes unknown filter values to defaults', async () => {
  const { parseReviewGridSessionState } = await loadReviewGridSessionStateModule();

  const parsed = parseReviewGridSessionState(JSON.stringify({
    sortMode: 'brand',
    brandFilterMode: 'all',
    selectedBrands: [],
    confidenceFilter: 'bogus',
    coverageFilter: 999,
    runStatusFilter: null,
  }));

  assert.equal(parsed.confidenceFilter, 'all');
  assert.equal(parsed.coverageFilter, 'all');
  assert.equal(parsed.runStatusFilter, 'all');
});

test('legacy JSON without filter fields hydrates with defaults (backward compat)', async () => {
  const { parseReviewGridSessionState } = await loadReviewGridSessionStateModule();

  const parsed = parseReviewGridSessionState(JSON.stringify({
    sortMode: 'recent',
    brandFilterMode: 'none',
    selectedBrands: [],
  }));

  assert.equal(parsed.sortMode, 'recent');
  assert.equal(parsed.brandFilterMode, 'none');
  assert.equal(parsed.confidenceFilter, 'all');
  assert.equal(parsed.coverageFilter, 'all');
  assert.equal(parsed.runStatusFilter, 'all');
});
