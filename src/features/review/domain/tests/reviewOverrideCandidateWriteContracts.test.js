import test from 'node:test';
import assert from 'node:assert/strict';

import {
  setOverrideFromCandidate,
} from '../overrideWorkflow.js';
import { resolveConsolidatedOverridePath } from '../../../../shared/consolidatedOverrides.js';
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

  const consolidatedPath = resolveConsolidatedOverridePath({ config, category });
  const overridePayload = await readOverridePayload(harness);
  assert.equal(setResult.override_path, consolidatedPath);
  assert.equal(setResult.candidate_id, 'cand_1');
  assert.equal(setResult.value, '59');
  assert.equal(overridePayload.overrides.weight.override_value, '59');
  assert.equal(overridePayload.overrides.weight.override_source, 'candidate_selection');
  assert.equal(overridePayload.overrides.weight.override_provenance.snippet_id, 'snp_weight_1');
});
