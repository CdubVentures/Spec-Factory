import test from 'node:test';
import assert from 'node:assert/strict';

import { setManualOverride } from '../overrideWorkflow.js';
import {
  createReviewOverrideHarness,
} from './helpers/reviewOverrideHarness.js';

test('setManualOverride requires evidence.url and evidence.quote', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-manual-reject',
  });
  const { storage, config, category, productId } = harness;

  await assert.rejects(
    () => setManualOverride({
      storage,
      config,
      category,
      productId,
      field: 'weight',
      value: '59',
      evidence: {
        url: '',
        quote: '',
      },
    }),
    /requires evidence.url and evidence.quote/i,
  );
});
