import test from 'node:test';
import assert from 'node:assert/strict';

import {
  finalizeOverrides,
  setOverrideFromCandidate,
} from '../overrideWorkflow.js';
import {
  upsertProductInConsolidated,
} from '../../../../shared/consolidatedOverrides.js';
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

test('finalizeOverrides applies SQL override value when consolidated JSON is stale', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-finalize-sql-wins',
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
  await upsertProductInConsolidated({
    config,
    category,
    productId,
    productEntry: {
      category,
      product_id: productId,
      review_status: 'in_progress',
      review_started_at: '2026-04-26T00:00:00.000Z',
      overrides: {
        weight: {
          field: 'weight',
          override_source: 'manual_entry',
          override_value: '61',
          value: '61',
          override_provenance: {
            url: 'https://stale.example/spec',
            quote: 'Weight: 61 g',
          },
          candidate_id: 'stale-json-candidate',
          source: {
            method: 'manual_override',
          },
        },
      },
    },
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
  const overrideDoc = await readOverridePayload(harness);
  assert.equal(overrideDoc.overrides.weight.override_value, '59');
  assert.equal(overrideDoc.overrides.weight.candidate_id, 'cand_1');
});
