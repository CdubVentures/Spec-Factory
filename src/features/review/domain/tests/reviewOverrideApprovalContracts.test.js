import test from 'node:test';
import assert from 'node:assert/strict';

import { approveGreenOverrides } from '../overrideWorkflow.js';
import {
  createReviewOverrideHarness,
  readOverridePayload,
  seedFieldRulesArtifacts,
  seedLatestArtifacts,
  seedReviewCandidates,
  seedReviewProductPayload,
} from './helpers/reviewOverrideHarness.js';

test('approveGreenOverrides writes candidate overrides only for green known fields', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-approve-greens',
  });
  const { storage, config, category, productId, specDb } = harness;
  await seedFieldRulesArtifacts(harness);
  await seedReviewCandidates(harness);
  seedLatestArtifacts(harness);
  await seedReviewProductPayload(harness, {
    dpi: {
      selected: {
        value: 'unk',
        confidence: 0,
        status: 'needs_review',
        color: 'gray',
      },
      needs_review: true,
      reason_codes: ['missing_value'],
      candidates: [],
    },
  });

  const result = await approveGreenOverrides({
    storage,
    config,
    category,
    productId,
    specDb,
    reviewer: 'reviewer_1',
    reason: 'bulk_green_approve',
  });
  const overridePayload = await readOverridePayload(harness);

  assert.equal(result.approved_count, 1);
  assert.equal(result.skipped_count >= 1, true);
  assert.equal(result.approved_fields.includes('weight'), true);
  assert.equal(overridePayload.review_status, 'in_progress');
  assert.equal(overridePayload.overrides.weight.override_source, 'candidate_selection');
  assert.equal(overridePayload.overrides.weight.override_reason, 'bulk_green_approve');
  assert.equal(overridePayload.overrides.dpi, undefined);

  const sqlRows = specDb.getFieldCandidatesByProductAndField(productId, 'weight', null);
  const resolvedRow = sqlRows.find((row) => row.status === 'resolved');
  assert.ok(resolvedRow);
  assert.equal(resolvedRow.source_type, 'candidate_override');
  assert.equal(resolvedRow.value, '59');
  assert.equal(resolvedRow.metadata_json.source, 'candidate_override');
  assert.equal(resolvedRow.metadata_json.override_source, 'candidate_selection');
  assert.equal(resolvedRow.metadata_json.candidate_id, 'cand_1');
});
