import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHORITY_SNAPSHOT_DOMAINS,
  buildAuthorityVersionToken,
  shouldRefreshAuthoritySnapshot,
  resolveAuthoritySnapshotInvalidationQueryKeys,
} from '../authoritySnapshotHelpers.js';

function hasQueryKey(keys, expected) {
  const target = JSON.stringify(expected);
  return keys.some((queryKey) => JSON.stringify(queryKey) === target);
}

test('buildAuthorityVersionToken composes canonical authority version string', () => {
  const token = buildAuthorityVersionToken({
    version: {
      map_hash: 'map:2026-02-23T12:00:00.000Z',
      compiled_hash: 'compiled:2026-02-23T11:00:00.000Z',
      specdb_sync_version: 7,
      updated_at: '2026-02-23T12:05:00.000Z',
    },
  });

  assert.equal(
    token,
    'map:2026-02-23T12:00:00.000Z|compiled:2026-02-23T11:00:00.000Z|7|2026-02-23T12:05:00.000Z',
  );
});

test('shouldRefreshAuthoritySnapshot only accepts relevant category/domain messages', () => {
  const shouldRefresh = shouldRefreshAuthoritySnapshot({
    message: {
      type: 'data-change',
      event: 'field-studio-map-saved',
      category: 'mouse',
      domains: ['studio', 'mapping'],
    },
    category: 'mouse',
  });
  assert.equal(shouldRefresh, true);

  const ignoredCategory = shouldRefreshAuthoritySnapshot({
    message: {
      type: 'data-change',
      event: 'field-studio-map-saved',
      category: 'keyboard',
      domains: ['studio', 'mapping'],
    },
    category: 'mouse',
  });
  assert.equal(ignoredCategory, false);

  const ignoredDomain = shouldRefreshAuthoritySnapshot({
    message: {
      type: 'data-change',
      event: 'queue-retry',
      category: 'mouse',
      domains: ['queue'],
    },
    category: 'mouse',
  });
  assert.equal(ignoredDomain, false);
});

test('resolveAuthoritySnapshotInvalidationQueryKeys includes snapshot and downstream query families', () => {
  const keys = resolveAuthoritySnapshotInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'review-override',
      category: 'mouse',
      domains: ['review', 'product'],
    },
    category: 'mouse',
  });

  assert.equal(hasQueryKey(keys, ['data-authority', 'snapshot', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['candidates', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['reviewProductsIndex', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['product', 'mouse']), true);
});

test('AUTHORITY_SNAPSHOT_DOMAINS includes required domains for phase 6', () => {
  assert.equal(AUTHORITY_SNAPSHOT_DOMAINS.includes('studio'), true);
  assert.equal(AUTHORITY_SNAPSHOT_DOMAINS.includes('review-layout'), true);
  assert.equal(AUTHORITY_SNAPSHOT_DOMAINS.includes('component'), true);
  assert.equal(AUTHORITY_SNAPSHOT_DOMAINS.includes('enum'), true);
});
