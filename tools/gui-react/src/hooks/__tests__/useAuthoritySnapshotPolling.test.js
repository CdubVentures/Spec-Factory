import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadHook() {
  return loadBundledModule('tools/gui-react/src/hooks/useAuthoritySnapshot.js', {
    prefix: 'use-authority-snapshot-polling-',
    stubs: {
      react: `
        export function useCallback(fn) { return fn; }
      `,
      '@tanstack/react-query': `
        export function useQuery(options) {
          globalThis.__authoritySnapshotHarness.queries.push(options);
          return {
            data: null,
            isLoading: false,
            isFetching: false,
            isError: false,
            error: null,
            refetch: async () => null,
          };
        }
        export function useQueryClient() {
          return {
            invalidateQueries: (payload) => {
              globalThis.__authoritySnapshotHarness.invalidations.push(payload);
            },
          };
        }
      `,
      '../api/client.ts': `
        export const api = { get: async () => ({}) };
      `,
      './useDataChangeSubscription.js': `
        export function useDataChangeSubscription(options) {
          globalThis.__authoritySnapshotHarness.subscriptions.push(options);
        }
      `,
      '../features/data-change/index.js': `
        export function shouldHandleDataChangeMessage() { return true; }
        export function resolveDataChangeScopedCategories(_message, category) { return [category]; }
        export function resolveDataChangeInvalidationQueryKeys() { return []; }
      `,
    },
  });
}

function resetHarness() {
  globalThis.__authoritySnapshotHarness = {
    queries: [],
    subscriptions: [],
    invalidations: [],
  };
}

test('useAuthoritySnapshot uses a low-churn fallback poll because data-change owns freshness', async () => {
  resetHarness();
  const { useAuthoritySnapshot } = await loadHook();

  useAuthoritySnapshot({ category: 'mouse' });

  assert.equal(globalThis.__authoritySnapshotHarness.queries.length, 1);
  assert.deepEqual(
    globalThis.__authoritySnapshotHarness.queries[0].queryKey,
    ['data-authority', 'snapshot', 'mouse'],
  );
  assert.equal(globalThis.__authoritySnapshotHarness.queries[0].enabled, true);
  assert.equal(globalThis.__authoritySnapshotHarness.queries[0].refetchInterval, 60_000);
  assert.equal(globalThis.__authoritySnapshotHarness.subscriptions.length, 1);
  assert.equal(globalThis.__authoritySnapshotHarness.subscriptions[0].enabled, true);
});

test('useAuthoritySnapshot allows explicit polling override for narrow callers', async () => {
  resetHarness();
  const { useAuthoritySnapshot } = await loadHook();

  useAuthoritySnapshot({ category: 'mouse', refetchIntervalMs: 5_000 });

  assert.equal(globalThis.__authoritySnapshotHarness.queries[0].refetchInterval, 5_000);
});
