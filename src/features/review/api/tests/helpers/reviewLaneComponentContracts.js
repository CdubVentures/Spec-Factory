import assert from 'node:assert/strict';
import {
  CATEGORY,
  PRODUCT_A,
  PRODUCT_B,
  apiJson,
  getComponentIdentityId,
  getComponentValueId,
  getStrictKeyReviewState,
} from '../fixtures/reviewLaneApiHarness.js';

export async function runReviewLaneComponentContracts(t, harness) {
  const { baseUrl, db, componentIdentifier, findComponentRow, readReviewDoc } = harness;

  await t.test('component shared accept with candidate-id collision does not mutate enum slot state', async () => {
    const collisionCandidateId = 'collision_shared_candidate';
    db.db.prepare(
      `UPDATE key_review_state
       SET selected_candidate_id = ?,
           selected_value = '35000',
           ai_confirm_shared_status = 'pending',
           ai_confirm_shared_confidence = NULL,
           ai_confirm_shared_at = NULL,
           ai_confirm_shared_error = NULL,
           user_accept_shared_status = NULL,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'component_key'
         AND component_identifier = ?
         AND property_key = 'dpi_max'`
    ).run(collisionCandidateId, CATEGORY, componentIdentifier);
    db.db.prepare(
      `UPDATE key_review_state
       SET selected_candidate_id = ?,
           selected_value = '2.4GHz',
           ai_confirm_shared_status = 'pending',
           ai_confirm_shared_confidence = NULL,
           ai_confirm_shared_at = NULL,
           ai_confirm_shared_error = NULL,
           user_accept_shared_status = NULL,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'enum_key'
         AND field_key = 'connection'
         AND enum_value_norm = '2.4ghz'`
    ).run(collisionCandidateId, CATEGORY);

    const componentIdentityId = getComponentIdentityId(db, CATEGORY, 'sensor', 'PAW3950', 'PixArt');
    const componentValueId = getComponentValueId(db, CATEGORY, 'sensor', 'PAW3950', 'PixArt', 'dpi_max');
    assert.ok(componentIdentityId);
    assert.ok(componentValueId);

    await apiJson(baseUrl, 'POST', `/review-components/${CATEGORY}/component-override`, {
      componentIdentityId,
      componentValueId,
      value: '35000',
      candidateId: collisionCandidateId,
      candidateSource: 'pipeline',
    });

    const componentState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'dpi_max',
      componentIdentifier,
      propertyKey: 'dpi_max',
    });
    const enumState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: '2.4ghz',
    });
    assert.equal(componentState.user_accept_shared_status, 'accepted');
    assert.equal(componentState.ai_confirm_shared_status, 'pending');
    assert.equal(enumState.user_accept_shared_status, null);
    assert.equal(enumState.ai_confirm_shared_status, 'pending');

    db.db.prepare(
      `UPDATE key_review_state
       SET selected_candidate_id = 'cmp_dpi_35000',
           selected_value = '35000',
           ai_confirm_shared_status = 'pending',
           ai_confirm_shared_confidence = NULL,
           ai_confirm_shared_at = NULL,
           ai_confirm_shared_error = NULL,
           user_accept_shared_status = NULL,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'component_key'
         AND component_identifier = ?
         AND property_key = 'dpi_max'`
    ).run(CATEGORY, componentIdentifier);
    db.db.prepare(
      `UPDATE key_review_state
       SET selected_candidate_id = 'global_connection_candidate',
           selected_value = '2.4GHz',
           ai_confirm_shared_status = 'pending',
           ai_confirm_shared_confidence = NULL,
           ai_confirm_shared_at = NULL,
           ai_confirm_shared_error = NULL,
           user_accept_shared_status = NULL,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'enum_key'
         AND field_key = 'connection'
         AND enum_value_norm = '2.4ghz'`
    ).run(CATEGORY);
  });

  await t.test('component accept and confirm remain decoupled and confirm is candidate scoped', async () => {
    db.db.prepare(
      `UPDATE key_review_state
       SET ai_confirm_shared_status = 'pending',
           ai_confirm_shared_confidence = NULL,
           ai_confirm_shared_at = NULL,
           ai_confirm_shared_error = NULL,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'component_key'
         AND component_identifier = ?
         AND property_key = 'dpi_max'`
    ).run(CATEGORY, componentIdentifier);

    const componentIdentityId = getComponentIdentityId(db, CATEGORY, 'sensor', 'PAW3950', 'PixArt');
    const componentValueId = getComponentValueId(db, CATEGORY, 'sensor', 'PAW3950', 'PixArt', 'dpi_max');
    assert.ok(componentIdentityId);
    assert.ok(componentValueId);

    await apiJson(baseUrl, 'POST', `/review-components/${CATEGORY}/component-override`, {
      componentIdentityId,
      componentValueId,
      value: '35000',
      candidateId: 'cmp_dpi_35000',
      candidateSource: 'pipeline',
    });

    const afterAccept = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'dpi_max',
      componentIdentifier,
      propertyKey: 'dpi_max',
    });
    assert.equal(afterAccept.user_accept_shared_status, 'accepted');
    assert.equal(afterAccept.ai_confirm_shared_status, 'pending');

    const componentPayloadAfterAccept = await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/components?type=sensor`);
    const componentRowAfterAccept = findComponentRow(componentPayloadAfterAccept);
    assert.equal(Boolean(componentRowAfterAccept?.properties?.dpi_max?.needs_review), true);
    const acceptedDpiCandidateAfterAccept = (componentRowAfterAccept?.properties?.dpi_max?.candidates || []).find(
      (candidate) => String(candidate?.candidate_id || '').trim() === 'cmp_dpi_35000'
    );
    assert.ok(acceptedDpiCandidateAfterAccept);
    assert.equal(String(acceptedDpiCandidateAfterAccept?.shared_review_status || '').trim().toLowerCase(), 'pending');

    await apiJson(baseUrl, 'POST', `/review-components/${CATEGORY}/component-key-review-confirm`, {
      componentIdentityId,
      componentValueId,
      candidateId: 'cmp_dpi_35000',
      candidateValue: '35000',
      candidateConfidence: 0.9,
    });

    const afterConfirm = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'dpi_max',
      componentIdentifier,
      propertyKey: 'dpi_max',
    });
    assert.equal(afterConfirm.ai_confirm_shared_status, 'pending');
    assert.equal(afterConfirm.user_accept_shared_status, 'accepted');

    const reviewDoc = await readReviewDoc();
    const review35000 = reviewDoc.items.find((item) => item.review_id === 'rv-cmp-35000');
    const review26000 = reviewDoc.items.find((item) => item.review_id === 'rv-cmp-26000');
    assert.equal(review35000?.status, 'pending_ai');
    assert.equal(review26000?.status, 'pending_ai');

    const payload = await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/components?type=sensor`);
    const row = findComponentRow(payload);
    assert.equal(row?.properties?.dpi_max?.accepted_candidate_id, 'cmp_dpi_35000');
    assert.equal(Boolean(row?.properties?.dpi_max?.needs_review), true);
    const confirmedCandidate = (row?.properties?.dpi_max?.candidates || []).find(
      (candidate) => String(candidate?.candidate_id || '').trim() === 'cmp_dpi_35000'
    );
    assert.equal(String(confirmedCandidate?.shared_review_status || '').trim().toLowerCase(), 'accepted');
    const stillPending = (row?.properties?.dpi_max?.candidates || []).filter(
      (candidate) => String(candidate?.shared_review_status || '').trim().toLowerCase() === 'pending'
    );
    assert.equal(stillPending.length > 0, true);
  });

  await t.test('component authoritative update cascades to linked items and re-flags constraints', async () => {
    const componentValueRow = db.db.prepare(
      `SELECT component_maker
       FROM component_values
       WHERE category = ?
         AND component_type = 'sensor'
         AND component_name = 'PAW3950'
         AND property_key = 'dpi_max'
       LIMIT 1`
    ).get(CATEGORY);
    const resolvedMaker = String(componentValueRow?.component_maker || '');

    db.db.prepare(
      `UPDATE component_values
       SET variance_policy = ?, constraints = ?
       WHERE category = ?
         AND component_type = 'sensor'
         AND component_name = 'PAW3950'
         AND component_maker = ?
         AND property_key = 'dpi_max'`
    ).run('authoritative', JSON.stringify(['dpi <= dpi_max']), CATEGORY, resolvedMaker);

    const componentIdentityId = getComponentIdentityId(db, CATEGORY, 'sensor', 'PAW3950', resolvedMaker);
    const componentValueId = getComponentValueId(db, CATEGORY, 'sensor', 'PAW3950', resolvedMaker, 'dpi_max');
    assert.ok(componentIdentityId);
    assert.ok(componentValueId);

    await apiJson(baseUrl, 'POST', `/review-components/${CATEGORY}/component-override`, {
      componentIdentityId,
      componentValueId,
      value: '25000',
      candidateId: 'cmp_dpi_25000',
      candidateSource: 'pipeline',
    });

    const propagated = db.db.prepare(
      `SELECT product_id, value, needs_ai_review
       FROM item_field_state
       WHERE category = ? AND field_key = 'dpi_max'
       ORDER BY product_id`
    ).all(CATEGORY);
    assert.equal(propagated.length, 2);
    const byProduct = new Map(propagated.map((row) => [row.product_id, row]));
    assert.equal(String(byProduct.get(PRODUCT_A)?.value || ''), '25000');
    assert.equal(String(byProduct.get(PRODUCT_B)?.value || ''), '25000');
    assert.equal(Number(byProduct.get(PRODUCT_A)?.needs_ai_review || 0), 1);
    assert.equal(Number(byProduct.get(PRODUCT_B)?.needs_ai_review || 0), 1);
  });
}
