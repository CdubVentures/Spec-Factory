import test from 'node:test';
import assert from 'node:assert/strict';

import {
  finalizeOverrides,
  setOverrideFromCandidate,
} from '../overrideWorkflow.js';
import {
  createReviewOverrideHarness,
  readLatestArtifacts,
  seedFieldRulesArtifacts,
  seedLatestArtifacts,
  seedReviewCandidates,
} from './helpers/reviewOverrideHarness.js';

test('finalizeOverrides applies candidate overrides to latest artifacts', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-finalize-apply',
  });
  const { storage, config, category, productId, specDb } = harness;
  await seedFieldRulesArtifacts(harness);
  await seedReviewCandidates(harness);
  await seedLatestArtifacts(harness);
  await setOverrideFromCandidate({
    storage,
    config,
    category,
    productId,
    specDb,
    field: 'weight',
    candidateId: 'cand_1',
  });

  const finalizeResult = await finalizeOverrides({
    storage,
    config,
    category,
    productId,
    specDb,
    applyOverrides: true,
  });
  const { normalized, provenance, summary } = await readLatestArtifacts(harness);

  assert.equal(finalizeResult.applied, true);
  assert.equal(finalizeResult.applied_count, 1);
  assert.equal(normalized.fields.weight, 59);
  assert.equal(summary.field_reasoning.weight.unknown_reason, null);
  assert.equal(provenance.weight.override.candidate_id, 'cand_1');
});
