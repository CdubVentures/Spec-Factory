import assert from 'node:assert/strict';
import {
  CATEGORY,
  PRODUCT_A,
  apiJson,
  getItemFieldStateId,
} from '../fixtures/reviewLaneApiHarness.js';

export async function runReviewLaneReadContracts(t, harness) {
  const { baseUrl, db } = harness;

  await t.test('component review GET does not mutate synthetic candidates on read', async () => {
    db.upsertComponentReviewItem({
      review_id: 'rv-cmp-unknown-like',
      category: CATEGORY,
      component_type: 'sensor',
      field_key: 'sensor',
      raw_query: 'PAW3950',
      matched_component: 'PAW3950',
      match_type: 'exact',
      status: 'pending_ai',
      product_id: PRODUCT_A,
      created_at: '2026-02-18T00:00:04.000Z',
      product_attributes: { sku: null, dpi_max: '35500' },
    });

    await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/components?type=sensor`);

  });

  await t.test('grid candidates endpoint synthesizes selected candidate id when lane points to missing candidate row', async () => {
    // WHY: Use the server API to ensure a consistent key_review_state rather
    // than raw SQL which may race with the server's async reconcile.
    const weightSlotId = getItemFieldStateId(db, CATEGORY, PRODUCT_A, 'weight');
    assert.ok(weightSlotId, 'weight item_field_state row must exist');

    // Accept a candidate through the API to ensure key_review_state exists
    await apiJson(baseUrl, 'POST', `/review/${CATEGORY}/key-review-accept`, {
      itemFieldStateId: weightSlotId,
      lane: 'primary',
      candidateId: 'ghost_weight_candidate',
      candidateValue: '49',
      candidateConfidence: 0.95,
    });

    const payload = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/candidates/${PRODUCT_A}/weight`);
    assert.equal(payload.keyReview?.selectedCandidateId, 'ghost_weight_candidate');
    assert.equal(
      payload.candidates.some((candidate) => candidate.candidate_id === 'ghost_weight_candidate'),
      true,
    );
  });
}
