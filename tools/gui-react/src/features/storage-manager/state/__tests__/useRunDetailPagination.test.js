import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadRunDetailModule() {
  return loadBundledModule('tools/gui-react/src/features/storage-manager/state/useRunDetail.ts', {
    prefix: 'storage-run-detail-pagination-',
    stubs: {
      '@tanstack/react-query': `
        export function useQuery(options) {
          globalThis.__runDetailPaginationHarness.queries.push({
            queryKey: options.queryKey,
            enabled: options.enabled,
            staleTime: options.staleTime,
          });
          if (options.enabled !== false && typeof options.queryFn === 'function') {
            globalThis.__runDetailPaginationHarness.pending.push(Promise.resolve(options.queryFn()));
          }
          return { data: null, isLoading: false, error: null };
        }
      `,
      '../../../api/client.ts': `
        export const api = {
          get(url) {
            globalThis.__runDetailPaginationHarness.urls.push(url);
            return Promise.resolve({ url });
          },
        };
      `,
    },
  });
}

function resetHarness() {
  globalThis.__runDetailPaginationHarness = {
    queries: [],
    pending: [],
    urls: [],
  };
}

test('useRunDetail scopes cache and request URL by source page', async () => {
  resetHarness();
  const { useRunDetail } = await loadRunDetailModule();

  useRunDetail('run-123', { sourcesLimit: 25, sourcesOffset: 50 });
  await Promise.all(globalThis.__runDetailPaginationHarness.pending);

  assert.deepEqual(globalThis.__runDetailPaginationHarness.queries[0], {
    queryKey: ['storage', 'runs', 'run-123', 'sources', 25, 50],
    enabled: true,
    staleTime: 60_000,
  });
  assert.equal(
    globalThis.__runDetailPaginationHarness.urls[0],
    '/storage/runs/run-123?sourcesLimit=25&sourcesOffset=50',
  );
});

test('useRunDetail keeps the disabled null-run contract', async () => {
  resetHarness();
  const { useRunDetail } = await loadRunDetailModule();

  useRunDetail(null, { sourcesLimit: 25, sourcesOffset: 50 });

  assert.equal(globalThis.__runDetailPaginationHarness.queries[0].enabled, false);
  assert.deepEqual(globalThis.__runDetailPaginationHarness.pending, []);
});
