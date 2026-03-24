import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveOverrideFilePath,
  setOverrideFromCandidate,
} from '../overrideWorkflow.js';
import {
  createReviewOverrideHarness,
  readOverridePayload,
  seedFieldRulesArtifacts,
  seedLatestArtifacts,
  seedReviewCandidates,
} from './helpers/reviewOverrideHarness.js';

test('setOverrideFromCandidate writes helper override entries from review candidates', async (t) => {
  const harness = await createReviewOverrideHarness(t);
  const { storage, config, category, productId } = harness;
  await seedFieldRulesArtifacts(harness);
  await seedReviewCandidates(harness);
  await seedLatestArtifacts(harness);

  const setResult = await setOverrideFromCandidate({
    storage,
    config,
    category,
    productId,
    field: 'weight',
    candidateId: 'cand_1',
  });

  const overridePath = resolveOverrideFilePath({ config, category, productId });
  const overridePayload = await readOverridePayload(harness);
  assert.equal(setResult.override_path, overridePath);
  assert.equal(setResult.candidate_id, 'cand_1');
  assert.equal(setResult.value, '59');
  assert.equal(overridePayload.overrides.weight.override_value, '59');
  assert.equal(overridePayload.overrides.weight.override_source, 'candidate_selection');
  assert.equal(overridePayload.overrides.weight.override_provenance.snippet_id, 'snp_weight_1');
});

test('setOverrideFromCandidate accepts synthetic candidates when candidateValue is provided', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-synthetic-candidate',
  });
  const { storage, config, category, productId } = harness;
  await seedFieldRulesArtifacts(harness);
  await seedLatestArtifacts(harness);

  const setResult = await setOverrideFromCandidate({
    storage,
    config,
    category,
    productId,
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
  assert.equal(overridePayload.overrides.weight.source.method, 'product_extraction');
});
