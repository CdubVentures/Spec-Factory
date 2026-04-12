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
import { readOverridePayload } from './helpers/reviewOverrideHarness.js';

test('finalizeOverrides applies candidate overrides and reports applied fields', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-finalize-apply',
  });
  const { storage, config, category, productId, specDb } = harness;
  await seedFieldRulesArtifacts(harness);
  specDb.upsertCompiledRules(JSON.stringify({
    fields: {
      weight: {
        required_level: 'required',
        contract: { type: 'number', shape: 'scalar', unit: 'g', range: { min: 30, max: 200 } },
      },
    },
  }));
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

  const finalizeResult = await finalizeOverrides({
    storage,
    config,
    category,
    productId,
    specDb,
    applyOverrides: true,
  });

  assert.equal(finalizeResult.applied, true);
  assert.equal(finalizeResult.applied_count, 1);
  assert.deepEqual(finalizeResult.applied_fields, ['weight']);

  const overrideDoc = await readOverridePayload(harness);
  assert.equal(overrideDoc.review_status, 'approved');
  assert.ok(overrideDoc.overrides.weight);
});
