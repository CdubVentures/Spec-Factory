import assert from 'node:assert/strict';
import {
  CATEGORY,
  PRODUCT_A,
  PRODUCT_B,
  apiJson,
  apiRawJson,
  findEnumValue,
  getItemFieldStateId,
  getStrictKeyReviewState,
} from '../fixtures/reviewLaneApiHarness.js';

export async function runReviewLaneGridContracts(t, harness) {
  const { baseUrl, db, componentIdentifier } = harness;

  await t.test('grid primary accept with candidate-id collision stays slot-scoped', async () => {
    const collisionCandidateId = 'collision_primary_candidate';
    db.db.prepare(
      `UPDATE key_review_state
       SET selected_candidate_id = ?,
           selected_value = '49',
           ai_confirm_primary_status = 'pending',
           ai_confirm_primary_confidence = NULL,
           ai_confirm_primary_at = NULL,
           ai_confirm_primary_error = NULL,
           user_accept_primary_status = NULL,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'grid_key'
         AND item_identifier = ?
         AND field_key = 'weight'`
    ).run(collisionCandidateId, CATEGORY, PRODUCT_A);
    db.db.prepare(
      `UPDATE key_review_state
       SET selected_candidate_id = ?,
           selected_value = '35000',
           ai_confirm_primary_status = 'pending',
           ai_confirm_primary_confidence = NULL,
           ai_confirm_primary_at = NULL,
           ai_confirm_primary_error = NULL,
           user_accept_primary_status = NULL,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'grid_key'
         AND item_identifier = ?
         AND field_key = 'dpi'`
    ).run(collisionCandidateId, CATEGORY, PRODUCT_A);

    const weightSlotId = getItemFieldStateId(db, CATEGORY, PRODUCT_A, 'weight');
    assert.ok(weightSlotId);
    await apiJson(baseUrl, 'POST', `/review/${CATEGORY}/key-review-accept`, {
      itemFieldStateId: weightSlotId,
      lane: 'primary',
      candidateId: collisionCandidateId,
    });

    const weightState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: PRODUCT_A,
      fieldKey: 'weight',
    });
    const dpiState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: PRODUCT_A,
      fieldKey: 'dpi',
    });
    assert.equal(weightState.user_accept_primary_status, 'accepted');
    assert.equal(dpiState.user_accept_primary_status, null);
    assert.equal(dpiState.ai_confirm_primary_status, 'pending');

    db.db.prepare(
      `UPDATE key_review_state
       SET selected_candidate_id = 'p1-weight-1',
           selected_value = '49',
           ai_confirm_primary_status = 'pending',
           ai_confirm_primary_confidence = NULL,
           ai_confirm_primary_at = NULL,
           ai_confirm_primary_error = NULL,
           user_accept_primary_status = NULL,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'grid_key'
         AND item_identifier = ?
         AND field_key = 'weight'`
    ).run(CATEGORY, PRODUCT_A);
    db.db.prepare(
      `UPDATE key_review_state
       SET selected_candidate_id = 'p1-dpi-1',
           selected_value = '35000',
           ai_confirm_primary_status = 'pending',
           ai_confirm_primary_confidence = NULL,
           ai_confirm_primary_at = NULL,
           ai_confirm_primary_error = NULL,
           user_accept_primary_status = NULL,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'grid_key'
         AND item_identifier = ?
         AND field_key = 'dpi'`
    ).run(CATEGORY, PRODUCT_A);
  });

  await t.test('grid item confirm only confirms item lane', async () => {
    const weightSlotId = getItemFieldStateId(db, CATEGORY, PRODUCT_A, 'weight');
    assert.ok(weightSlotId);
    const weightCandidatesBefore = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/candidates/${PRODUCT_A}/weight`);
    const weightCandidateId = String(
      (weightCandidatesBefore.candidates || [])[0]?.candidate_id || ''
    ).trim();
    assert.ok(weightCandidateId, 'should have at least one synthetic candidate');

    await apiJson(baseUrl, 'POST', `/review/${CATEGORY}/key-review-confirm`, {
      itemFieldStateId: weightSlotId,
      lane: 'primary',
      candidateId: weightCandidateId,
      candidateValue: '49',
      candidateConfidence: 0.95,
    });

    const state = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: PRODUCT_A,
      fieldKey: 'weight',
    });
    assert.equal(state.ai_confirm_primary_status, 'confirmed');
    assert.equal(state.user_accept_primary_status, null);

    const payload = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/candidates/${PRODUCT_A}/weight`);
    assert.equal(payload.keyReview.primaryStatus, 'confirmed');
    assert.equal(payload.keyReview.userAcceptPrimary, null);
  });

  await t.test('grid item accept only accepts item lane', async () => {
    const dpiSlotId = getItemFieldStateId(db, CATEGORY, PRODUCT_A, 'dpi');
    assert.ok(dpiSlotId);
    const dpiCandidatesBefore = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/candidates/${PRODUCT_A}/dpi`);
    const dpiCandidateId = String(
      (dpiCandidatesBefore.candidates || [])[0]?.candidate_id || ''
    ).trim();
    assert.ok(dpiCandidateId, 'should have at least one synthetic candidate');

    await apiJson(baseUrl, 'POST', `/review/${CATEGORY}/key-review-accept`, {
      itemFieldStateId: dpiSlotId,
      lane: 'primary',
      candidateId: dpiCandidateId,
      candidateValue: '35000',
      candidateConfidence: 0.97,
    });

    const state = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: PRODUCT_A,
      fieldKey: 'dpi',
    });
    assert.equal(state.user_accept_primary_status, 'accepted');

    const payload = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/candidates/${PRODUCT_A}/dpi`);
    assert.equal(payload.keyReview.userAcceptPrimary, 'accepted');
  });

  await t.test('grid shared confirm is context-local', async () => {
    const sensorSlotId = getItemFieldStateId(db, CATEGORY, PRODUCT_A, 'sensor');
    assert.ok(sensorSlotId);
    await apiJson(baseUrl, 'POST', `/review/${CATEGORY}/key-review-confirm`, {
      itemFieldStateId: sensorSlotId,
      lane: 'shared',
      candidateId: 'global_sensor_candidate',
      candidateValue: 'PAW3950',
      candidateConfidence: 0.98,
    });

    const productAState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: PRODUCT_A,
      fieldKey: 'sensor',
    });
    const productBState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: PRODUCT_B,
      fieldKey: 'sensor',
    });
    assert.equal(productAState.ai_confirm_shared_status, 'confirmed');
    assert.notEqual(productBState.ai_confirm_shared_status, 'confirmed');
    assert.equal(productAState.user_accept_shared_status, null);
    assert.equal(productBState.user_accept_shared_status, null);

    const sensorA = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/candidates/${PRODUCT_A}/sensor`);
    const sensorB = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/candidates/${PRODUCT_B}/sensor`);
    assert.equal(sensorA.keyReview.sharedStatus, 'confirmed');
    assert.notEqual(sensorB.keyReview.sharedStatus, 'confirmed');

    const componentState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'dpi_max',
      componentIdentifier,
      propertyKey: 'dpi_max',
    });
    assert.notEqual(componentState.ai_confirm_shared_status, 'confirmed');
  });

  await t.test('grid shared accept is slot-scoped and leaves enum state alone', async () => {
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
         AND target_kind = 'grid_key'
         AND field_key = 'connection'
         AND item_identifier IN (?, ?)`
    ).run(CATEGORY, PRODUCT_A, PRODUCT_B);
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

    const enumPayloadBefore = await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/enums`);
    const enumValueBefore = findEnumValue(enumPayloadBefore, 'connection', '2.4GHz');
    const enumAcceptedBefore = enumValueBefore?.accepted_candidate_id ?? null;

    const connectionSlotId = getItemFieldStateId(db, CATEGORY, PRODUCT_A, 'connection');
    assert.ok(connectionSlotId);
    await apiJson(baseUrl, 'POST', `/review/${CATEGORY}/key-review-accept`, {
      itemFieldStateId: connectionSlotId,
      lane: 'shared',
      candidateId: 'global_connection_candidate',
      candidateValue: '2.4GHz',
      candidateConfidence: 0.98,
    });

    const productAState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: PRODUCT_A,
      fieldKey: 'connection',
    });
    const productBState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: PRODUCT_B,
      fieldKey: 'connection',
    });
    const enumState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: '2.4ghz',
    });
    assert.equal(productAState.user_accept_shared_status, 'accepted');
    assert.equal(productBState.user_accept_shared_status, null);
    assert.equal(productAState.ai_confirm_shared_status, 'pending');
    assert.equal(enumState.user_accept_shared_status, null);
    assert.equal(enumState.ai_confirm_shared_status, 'pending');

    const connectionA = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/candidates/${PRODUCT_A}/connection`);
    const connectionB = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/candidates/${PRODUCT_B}/connection`);
    assert.equal(connectionA.keyReview.userAcceptShared, 'accepted');
    assert.equal(connectionB.keyReview.userAcceptShared, null);

    const enumPayloadAfter = await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/enums`);
    const enumValueAfter = findEnumValue(enumPayloadAfter, 'connection', '2.4GHz');
    assert.ok(enumValueAfter);
    assert.equal(enumValueAfter.accepted_candidate_id ?? null, enumAcceptedBefore);
  });

  await t.test('grid lane endpoints reject non-grid key_review_state ids', async () => {
    const componentStateId = db.db.prepare(
      `SELECT id
       FROM key_review_state
       WHERE category = ?
         AND target_kind = 'component_key'
       LIMIT 1`
    ).get(CATEGORY)?.id;
    const enumStateId = db.db.prepare(
      `SELECT id
       FROM key_review_state
       WHERE category = ?
         AND target_kind = 'enum_key'
       LIMIT 1`
    ).get(CATEGORY)?.id;
    assert.ok(componentStateId);
    assert.ok(enumStateId);

    const componentAccept = await apiRawJson(baseUrl, 'POST', `/review/${CATEGORY}/key-review-accept`, {
      id: componentStateId,
      lane: 'shared',
    });
    assert.equal(componentAccept.status, 400);
    assert.equal(componentAccept.data?.error, 'lane_context_mismatch');

    const enumConfirm = await apiRawJson(baseUrl, 'POST', `/review/${CATEGORY}/key-review-confirm`, {
      id: enumStateId,
      lane: 'shared',
    });
    assert.equal(enumConfirm.status, 400);
    assert.equal(enumConfirm.data?.error, 'lane_context_mismatch');
  });
}
