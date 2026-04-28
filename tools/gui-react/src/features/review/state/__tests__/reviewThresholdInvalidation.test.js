import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadReviewThresholdInvalidationModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/review/state/reviewThresholdInvalidation.ts',
    {
      prefix: 'review-threshold-invalidation-',
    },
  );
}

test('review threshold invalidation scopes candidate refreshes to the active category', async () => {
  const { invalidateReviewThresholdCaches } = await loadReviewThresholdInvalidationModule();
  const calls = [];
  const queryClient = {
    invalidateQueries(options) {
      calls.push(options);
    },
  };

  invalidateReviewThresholdCaches({ queryClient, category: 'mouse' });

  assert.deepEqual(calls, [
    { queryKey: ['candidates', 'mouse'] },
    { queryKey: ['reviewProductsIndex', 'mouse'] },
  ]);
});
