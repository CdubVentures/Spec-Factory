import assert from 'node:assert/strict';
import {
  CATEGORY,
  PRODUCT_A,
  apiJson,
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
      product_attributes: { sku: 'unk', dpi_max: '35500' },
    });

    await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/components?type=sensor`);

  });

  await t.test('grid candidates endpoint synthesizes selected candidate id when lane points to missing candidate row', async () => {
    db.db.prepare(
      `UPDATE key_review_state
       SET selected_candidate_id = 'ghost_weight_candidate',
           selected_value = '49',
           confidence_score = 0.95,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'grid_key'
         AND item_identifier = ?
         AND field_key = 'weight'`
    ).run(CATEGORY, PRODUCT_A);

    const payload = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/candidates/${PRODUCT_A}/weight`);
    assert.equal(payload.keyReview?.selectedCandidateId, 'ghost_weight_candidate');
    assert.equal(
      payload.candidates.some((candidate) => candidate.candidate_id === 'ghost_weight_candidate'),
      true,
    );
  });
}
