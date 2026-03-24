import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY,
  apiJson,
  findEnumValue,
  getEnumSlotIds,
  getStrictKeyReviewState,
  createReviewLaneApiHarness,
} from './fixtures/reviewLaneApiHarness.js';

test('review lane enum mutations stay candidate-scoped and propagate value changes', async (t) => {
  const harness = await createReviewLaneApiHarness(t);
  if (!harness) return;

  const { baseUrl, db, readReviewDoc } = harness;

  await t.test('enum accept and confirm remain decoupled and confirm is candidate scoped', async () => {
    const enumSlot = getEnumSlotIds(db, CATEGORY, 'connection', '2.4GHz');
    assert.ok(enumSlot.listValueId);
    assert.ok(enumSlot.enumListId);

    await apiJson(baseUrl, 'POST', `/review-components/${CATEGORY}/enum-override`, {
      listValueId: enumSlot.listValueId,
      enumListId: enumSlot.enumListId,
      action: 'accept',
      candidateId: 'global_connection_candidate',
    });

    const afterAccept = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: '2.4ghz',
    });
    assert.equal(afterAccept.user_accept_shared_status, 'accepted');
    assert.equal(afterAccept.ai_confirm_shared_status, 'pending');

    const enumPayloadAfterAccept = await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/enums`);
    const enumValueAfterAccept = findEnumValue(enumPayloadAfterAccept, 'connection', '2.4GHz');
    assert.ok(enumValueAfterAccept);
    assert.equal(enumValueAfterAccept.needs_review, true);
    const acceptedEnumCandidateAfterAccept = (enumValueAfterAccept.candidates || []).find(
      (candidate) => String(candidate?.candidate_id || '').trim() === 'global_connection_candidate'
    );
    assert.ok(acceptedEnumCandidateAfterAccept);
    assert.equal(String(acceptedEnumCandidateAfterAccept?.shared_review_status || '').trim().toLowerCase(), 'pending');

    await apiJson(baseUrl, 'POST', `/review-components/${CATEGORY}/enum-override`, {
      listValueId: enumSlot.listValueId,
      enumListId: enumSlot.enumListId,
      action: 'confirm',
      candidateId: 'global_connection_candidate',
    });

    const afterConfirm = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: '2.4ghz',
    });
    assert.equal(afterConfirm.ai_confirm_shared_status, 'pending');
    assert.equal(afterConfirm.user_accept_shared_status, 'accepted');

    const reviewDoc = await readReviewDoc();
    const review24 = reviewDoc.items.find((item) => item.review_id === 'rv-enum-24');
    const reviewWireless = reviewDoc.items.find((item) => item.review_id === 'rv-enum-wireless');
    assert.equal(review24?.status, 'pending_ai');
    assert.equal(reviewWireless?.status, 'pending_ai');

    const enumPayloadAfterConfirm = await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/enums`);
    const confirmedValue = findEnumValue(enumPayloadAfterConfirm, 'connection', '2.4GHz');
    assert.ok(confirmedValue);
    assert.equal(confirmedValue.accepted_candidate_id, 'global_connection_candidate');
    const confirmedEnumCandidate = (confirmedValue.candidates || []).find(
      (candidate) => String(candidate?.candidate_id || '').trim() === 'global_connection_candidate'
    );
    assert.equal(String(confirmedEnumCandidate?.shared_review_status || '').trim().toLowerCase(), 'accepted');
    assert.equal(confirmedValue.needs_review, true);
  });

  await t.test('enum accept with oldValue renames and propagates to linked items', async () => {
    const enumSlot = getEnumSlotIds(db, CATEGORY, 'connection', '2.4GHz');
    assert.ok(enumSlot.listValueId);
    assert.ok(enumSlot.enumListId);

    await apiJson(baseUrl, 'POST', `/review-components/${CATEGORY}/enum-override`, {
      listValueId: enumSlot.listValueId,
      enumListId: enumSlot.enumListId,
      value: 'Wireless',
      oldValue: '2.4GHz',
      action: 'accept',
      candidateId: 'global_connection_candidate',
    });

    const renamedRows = db.db.prepare(
      `SELECT product_id, value
       FROM item_field_state
       WHERE category = ? AND field_key = 'connection'
       ORDER BY product_id`
    ).all(CATEGORY);
    assert.equal(renamedRows.length, 2);
    assert.equal(String(renamedRows[0].value || ''), 'Wireless');
    assert.equal(String(renamedRows[1].value || ''), 'Wireless');

    const enumState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: 'wireless',
    });
    assert.equal(enumState?.user_accept_shared_status, 'accepted');
    assert.equal(enumState?.ai_confirm_shared_status, 'pending');

    const enumPayload = await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/enums`);
    const oldValue = findEnumValue(enumPayload, 'connection', '2.4GHz');
    const newValue = findEnumValue(enumPayload, 'connection', 'Wireless');
    assert.equal(oldValue, null);
    assert.ok(newValue);
    assert.equal(newValue.needs_review, true);
  });
});
