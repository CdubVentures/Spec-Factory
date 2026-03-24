import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadPrefetchUiContracts() {
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/selectors/prefetchUiContracts.ts', {
    prefix: 'runtime-ops-prefetch-contracts-',
  });
}

test('prefetch tab contracts expose disabled aria state and ignore disabled tab toggles', async () => {
  const { buildPrefetchTabState, resolveNextPrefetchTabSelection } = await loadPrefetchUiContracts();
  const disabledTabs = new Set(['brand_resolver']);
  const busyTabs = new Set(['brand_resolver']);

  assert.deepEqual(
    buildPrefetchTabState({
      activeTab: 'brand_resolver',
      tabKey: 'brand_resolver',
      disabledTabs,
      busyTabs,
    }),
    {
      isSelected: true,
      isBusy: true,
      isDisabled: true,
      ariaDisabled: true,
    },
  );

  assert.equal(
    resolveNextPrefetchTabSelection({
      activeTab: 'brand_resolver',
      tabKey: 'brand_resolver',
      disabledTabs,
    }),
    'brand_resolver',
  );
  assert.equal(
    resolveNextPrefetchTabSelection({
      activeTab: 'search_results',
      tabKey: 'search_results',
      disabledTabs,
    }),
    null,
  );
});

test('drawer extract contracts emit full and partial packet-hydration notices without dead empty states', async () => {
  const { resolveIndexedFieldHydrationNotice } = await loadPrefetchUiContracts();

  assert.deepEqual(
    resolveIndexedFieldHydrationNotice([], ['dpi', 'weight']),
    {
      kind: 'all_pending',
      title: '2 indexed fields pending packet hydration',
      description: 'The page indexed successfully, but per-field evidence packets have not been materialized yet.',
      fieldNames: ['dpi', 'weight'],
    },
  );

  assert.deepEqual(
    resolveIndexedFieldHydrationNotice([{ field: 'dpi', confidence: 0.9, method: 'dom', source_url: 'https://x.test', value: '100' }], ['weight']),
    {
      kind: 'partial',
      title: '1 additional indexed fields pending packet hydration',
      description: 'The page indexed more fields than have per-field evidence packets available right now.',
      fieldNames: ['weight'],
    },
  );

  assert.equal(resolveIndexedFieldHydrationNotice([], []), null);
});
