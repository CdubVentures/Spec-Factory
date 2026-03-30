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
  const { storage, config, category, productId, specDb } = harness;
  await seedFieldRulesArtifacts(harness);
  await seedReviewCandidates(harness);
  await seedLatestArtifacts(harness);

  const setResult = await setOverrideFromCandidate({
    storage,
    config,
    category,
    productId,
    specDb,
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
