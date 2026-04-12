import test from 'node:test';
import assert from 'node:assert/strict';

import {
  setOverrideFromCandidate,
} from '../overrideWorkflow.js';
import {
  createReviewOverrideHarness,
  readOverridePayload,
  seedFieldRulesArtifacts,
  seedLatestArtifacts,
} from './helpers/reviewOverrideHarness.js';

test('setOverrideFromCandidate accepts synthetic candidates when candidateValue is provided', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-synthetic-candidate',
  });
  const { storage, config, category, productId, specDb } = harness;
  await seedFieldRulesArtifacts(harness);
  seedLatestArtifacts(harness);

  const setResult = await setOverrideFromCandidate({
    storage,
    config,
    category,
    productId,
    specDb,
    field: 'weight',
    candidateId: 'pl_weight_synthetic_1',
    candidateValue: '59',
    candidateSource: 'pipeline',
    candidateMethod: 'product_extraction',
  });

  const overridePayload = await readOverridePayload(harness);
  assert.equal(setResult.candidate_id, 'pl_weight_synthetic_1');
  assert.equal(setResult.value, '59');
  assert.equal(overridePayload.overrides.weight.candidate_id, 'pl_weight_synthetic_1');
  assert.equal(overridePayload.overrides.weight.override_value, '59');
  assert.equal(overridePayload.overrides.weight.override_source, 'candidate_selection');
});
