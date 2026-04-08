import test from 'node:test';
import assert from 'node:assert/strict';

import {
  finalizeOverrides,
  setOverrideFromCandidate,
} from '../overrideWorkflow.js';
import {
  createReviewOverrideHarness,
  readLatestArtifacts,
  readOverridePayload,
  seedFieldRulesArtifacts,
  seedLatestArtifacts,
  seedReviewCandidates,
} from './helpers/reviewOverrideHarness.js';

test('finalizeOverrides demotes invalid override values through the runtime engine gate', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-override-invalid',
  });
  const { storage, config, category, productId, specDb } = harness;
  await seedFieldRulesArtifacts(harness);
  // WHY: Runtime engine reads compiled rules from specDb — seed them so the range gate works.
  specDb.upsertCompiledRules(JSON.stringify({
    fields: {
      weight: {
        required_level: 'required',
        contract: { type: 'number', shape: 'scalar', unit: 'g', range: { min: 30, max: 200 } },
      },
    },
  }));
  await seedReviewCandidates(harness, '10');
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

  const blocked = await finalizeOverrides({
    storage,
    config,
    category,
    productId,
    specDb,
    applyOverrides: true,
  });

  assert.equal(blocked.applied, false);
  assert.equal(blocked.reason, 'runtime_validation_failed');
  assert.equal(blocked.runtime_gate.failure_count > 0, true);

  const finalizeResult = await finalizeOverrides({
    storage,
    config,
    category,
    productId,
    specDb,
    applyOverrides: true,
    saveAsDraft: true,
  });
  const { normalized, summary } = await readLatestArtifacts(harness);
  const overridePayload = await readOverridePayload(harness);

  assert.equal(finalizeResult.applied, true);
  assert.equal(finalizeResult.runtime_gate.failure_count > 0, true);
  assert.equal(normalized.fields.weight, 'unk');
  assert.equal(summary.field_reasoning.weight.unknown_reason, 'out_of_range');
  assert.equal(overridePayload.review_status, 'draft');
});
