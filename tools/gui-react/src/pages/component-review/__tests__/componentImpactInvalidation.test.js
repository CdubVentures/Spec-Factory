import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadComponentImpactInvalidationModule() {
  return loadBundledModule(
    'tools/gui-react/src/pages/component-review/componentImpactInvalidation.ts',
    {
      prefix: 'component-impact-invalidation-',
    },
  );
}

test('component impact invalidation is scoped to the active category', async () => {
  const { invalidateComponentImpactForCategory } = await loadComponentImpactInvalidationModule();
  const calls = [];
  const queryClient = {
    invalidateQueries(options) {
      calls.push(options);
    },
  };

  invalidateComponentImpactForCategory({ queryClient, category: 'mouse' });

  assert.deepEqual(calls, [
    { queryKey: ['componentImpact', 'mouse'] },
  ]);
});
