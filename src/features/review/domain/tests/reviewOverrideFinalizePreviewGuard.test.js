import test from 'node:test';
import assert from 'node:assert/strict';

import {
  finalizeOverrides,
  setOverrideFromCandidate,
} from '../overrideWorkflow.js';
import {
  createReviewOverrideHarness,
  seedFieldRulesArtifacts,
  seedLatestArtifacts,
  seedReviewCandidates,
} from './helpers/reviewOverrideHarness.js';

test('finalizeOverrides requires applyOverrides before mutating', async (t) => {
  const harness = await createReviewOverrideHarness(t);
  const { storage, config, category, productId, specDb } = harness;
  await seedFieldRulesArtifacts(harness);
  await seedReviewCandidates(harness);
  seedLatestArtifacts(harness);
  await setOverrideFromCandidate({
    storage,
    config,
    category,
    productId,
    specDb,
    field: 'weight',
    candidateId: 'cand_1',
  });

  const previewFinalize = await finalizeOverrides({
    storage,
    config,
    category,
    productId,
    specDb,
    applyOverrides: false,
  });

  assert.equal(previewFinalize.applied, false);
  assert.equal(previewFinalize.reason, 'apply_overrides_flag_not_set');
  assert.deepStrictEqual(previewFinalize.pending_fields, ['weight']);
});
