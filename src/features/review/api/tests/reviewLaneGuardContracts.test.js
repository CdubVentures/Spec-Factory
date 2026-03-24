import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY,
  PRODUCT_A,
  apiJson,
  apiRawJson,
  findEnumValue,
  getComponentIdentityId,
  getComponentValueId,
  getEnumSlotIds,
  getItemFieldStateId,
  getStrictKeyReviewState,
  upsertStrictKeyReviewState,
  createReviewLaneApiHarness,
} from './fixtures/reviewLaneApiHarness.js';

test('review lane guards reject missing candidates and unknown values', async (t) => {
  const harness = await createReviewLaneApiHarness(t);
  if (!harness) return;

  const { baseUrl, db, componentIdentifier, findComponentRow } = harness;

  await t.test('confirm endpoints require candidate ids for pending lanes with zero candidates', async () => {
    db.db.prepare(
      `DELETE FROM candidate_reviews
       WHERE candidate_id IN (
         SELECT candidate_id
         FROM candidates
         WHERE category = ? AND product_id = ? AND field_key = ?
       )`
    ).run(CATEGORY, PRODUCT_A, 'weight');
    db.db.prepare('DELETE FROM candidates WHERE category = ? AND product_id = ? AND field_key = ?').run(
      CATEGORY,
      PRODUCT_A,
      'weight',
    );
    db.db.prepare(
      `UPDATE key_review_state
       SET selected_candidate_id = NULL,
           ai_confirm_primary_status = 'pending',
           ai_confirm_primary_confidence = NULL,
           ai_confirm_primary_at = NULL,
           ai_confirm_primary_error = NULL,
           user_accept_primary_status = NULL,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'grid_key'
         AND item_identifier = ?
         AND field_key = ?`
    ).run(CATEGORY, PRODUCT_A, 'weight');

    const weightBefore = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/candidates/${PRODUCT_A}/weight`);
    assert.equal(Array.isArray(weightBefore?.candidates), true);
    assert.equal(weightBefore?.keyReview?.primaryStatus, 'pending');

    const weightSlotId = getItemFieldStateId(db, CATEGORY, PRODUCT_A, 'weight');
    assert.ok(weightSlotId);
    const gridConfirmNoCandidate = await apiRawJson(baseUrl, 'POST', `/review/${CATEGORY}/key-review-confirm`, {
      itemFieldStateId: weightSlotId,
      lane: 'primary',
    });
    assert.equal(gridConfirmNoCandidate.status, 400);
    assert.equal(gridConfirmNoCandidate.data?.error, 'candidate_id_required');

    const weightAfter = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: PRODUCT_A,
      fieldKey: 'weight',
    });
    assert.equal(weightAfter?.ai_confirm_primary_status, 'pending');
    assert.equal(weightAfter?.user_accept_primary_status, null);

    db.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      propertyKey: 'custom_prop',
      value: 'alpha',
      confidence: 0.6,
      variancePolicy: null,
      source: 'manual',
      acceptedCandidateId: null,
      needsReview: true,
      overridden: false,
      constraints: [],
    });
    upsertStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'custom_prop',
      componentIdentifier,
      propertyKey: 'custom_prop',
      selectedValue: 'alpha',
      selectedCandidateId: null,
      confidenceScore: 0.6,
      aiConfirmSharedStatus: 'pending',
      userAcceptSharedStatus: null,
    });

    const componentPayloadBefore = await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/components?type=sensor`);
    const componentRowBefore = findComponentRow(componentPayloadBefore);
    assert.ok(componentRowBefore);
    assert.equal(Array.isArray(componentRowBefore?.properties?.custom_prop?.candidates), true);
    assert.equal(componentRowBefore?.properties?.custom_prop?.candidates?.length || 0, 0);
    assert.equal(Boolean(componentRowBefore?.properties?.custom_prop?.needs_review), true);

    const componentConfirmNoCandidate = await apiRawJson(baseUrl, 'POST', `/review-components/${CATEGORY}/component-key-review-confirm`, {
      componentIdentityId: getComponentIdentityId(db, CATEGORY, 'sensor', 'PAW3950', 'PixArt'),
      componentValueId: getComponentValueId(db, CATEGORY, 'sensor', 'PAW3950', 'PixArt', 'custom_prop'),
      candidateValue: 'alpha',
    });
    assert.equal(componentConfirmNoCandidate.status, 400);
    assert.equal(componentConfirmNoCandidate.data?.error, 'candidate_id_required');

    const componentStateAfter = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'custom_prop',
      componentIdentifier,
      propertyKey: 'custom_prop',
    });
    assert.equal(componentStateAfter?.ai_confirm_shared_status, 'pending');
    assert.equal(componentStateAfter?.user_accept_shared_status, null);

    const componentPayloadAfter = await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/components?type=sensor`);
    const componentRowAfter = findComponentRow(componentPayloadAfter);
    assert.equal(Boolean(componentRowAfter?.properties?.custom_prop?.needs_review), true);

    db.upsertListValue({
      fieldKey: 'connection',
      value: 'ZeroCand',
      normalizedValue: 'zerocand',
      source: 'manual',
      enumPolicy: 'closed',
      acceptedCandidateId: null,
      needsReview: true,
      overridden: false,
      sourceTimestamp: new Date().toISOString(),
    });
    upsertStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: 'zerocand',
      selectedValue: 'ZeroCand',
      selectedCandidateId: null,
      confidenceScore: 0.6,
      aiConfirmSharedStatus: 'pending',
      userAcceptSharedStatus: null,
    });

    const enumPayloadBefore = await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/enums`);
    const zeroBefore = findEnumValue(enumPayloadBefore, 'connection', 'ZeroCand');
    assert.ok(zeroBefore);
    assert.equal(Array.isArray(zeroBefore?.candidates), true);
    assert.equal(zeroBefore?.candidates?.length || 0, 0);
    assert.equal(Boolean(zeroBefore?.needs_review), true);

    const zeroCandSlot = getEnumSlotIds(db, CATEGORY, 'connection', 'ZeroCand');
    assert.ok(zeroCandSlot.listValueId);
    assert.ok(zeroCandSlot.enumListId);
    const enumConfirmNoCandidate = await apiRawJson(baseUrl, 'POST', `/review-components/${CATEGORY}/enum-override`, {
      listValueId: zeroCandSlot.listValueId,
      enumListId: zeroCandSlot.enumListId,
      action: 'confirm',
    });
    assert.equal(enumConfirmNoCandidate.status, 400);
    assert.equal(enumConfirmNoCandidate.data?.error, 'candidate_id_required');

    const zeroAfterState = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: 'zerocand',
    });
    assert.equal(zeroAfterState?.ai_confirm_shared_status, 'pending');
    assert.equal(zeroAfterState?.user_accept_shared_status, null);

    const enumPayloadAfter = await apiJson(baseUrl, 'GET', `/review-components/${CATEGORY}/enums`);
    const zeroAfter = findEnumValue(enumPayloadAfter, 'connection', 'ZeroCand');
    assert.ok(zeroAfter);
    assert.equal(Boolean(zeroAfter?.needs_review), true);
  });

  await t.test('unknown selected values cannot be accepted or confirmed across grid, component, and enum lanes', async () => {
    db.db.prepare(
      `UPDATE key_review_state
       SET selected_candidate_id = NULL,
           selected_value = 'unk',
           ai_confirm_primary_status = 'pending',
           ai_confirm_primary_confidence = NULL,
           ai_confirm_primary_at = NULL,
           ai_confirm_primary_error = NULL,
           user_accept_primary_status = NULL,
           updated_at = datetime('now')
       WHERE category = ?
         AND target_kind = 'grid_key'
         AND item_identifier = ?
         AND field_key = ?`
    ).run(CATEGORY, PRODUCT_A, 'weight');

    const weightSlotId = getItemFieldStateId(db, CATEGORY, PRODUCT_A, 'weight');
    assert.ok(weightSlotId);
    const gridConfirmUnknown = await apiRawJson(baseUrl, 'POST', `/review/${CATEGORY}/key-review-confirm`, {
      itemFieldStateId: weightSlotId,
      lane: 'primary',
    });
    assert.equal(gridConfirmUnknown.status, 400);
    assert.equal(gridConfirmUnknown.data?.error, 'candidate_id_required');

    const gridAcceptUnknown = await apiRawJson(baseUrl, 'POST', `/review/${CATEGORY}/key-review-accept`, {
      itemFieldStateId: weightSlotId,
      lane: 'primary',
    });
    assert.equal(gridAcceptUnknown.status, 400);
    assert.equal(gridAcceptUnknown.data?.error, 'candidate_id_required');

    const componentIdentityId = getComponentIdentityId(db, CATEGORY, 'sensor', 'PAW3950', 'PixArt');
    const dpiMaxSlotId = getComponentValueId(db, CATEGORY, 'sensor', 'PAW3950', 'PixArt', 'dpi_max');
    assert.ok(componentIdentityId);
    assert.ok(dpiMaxSlotId);
    const componentUnknownAccept = await apiRawJson(baseUrl, 'POST', `/review-components/${CATEGORY}/component-override`, {
      componentIdentityId,
      componentValueId: dpiMaxSlotId,
      value: 'unk',
      candidateId: 'cmp_dpi_unknown',
      candidateSource: 'pipeline',
    });
    assert.equal(componentUnknownAccept.status, 400);
    assert.equal(componentUnknownAccept.data?.error, 'unknown_value_not_actionable');

    db.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      propertyKey: 'unk_only_prop',
      value: 'unk',
      confidence: 0.4,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: null,
      needsReview: true,
      overridden: false,
      constraints: [],
    });
    upsertStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'unk_only_prop',
      componentIdentifier,
      propertyKey: 'unk_only_prop',
      selectedValue: 'unk',
      selectedCandidateId: null,
      confidenceScore: 0.4,
      aiConfirmSharedStatus: 'pending',
      userAcceptSharedStatus: null,
    });

    const unkOnlySlotId = getComponentValueId(db, CATEGORY, 'sensor', 'PAW3950', 'PixArt', 'unk_only_prop');
    assert.ok(unkOnlySlotId);
    const componentConfirmUnknown = await apiRawJson(baseUrl, 'POST', `/review-components/${CATEGORY}/component-key-review-confirm`, {
      componentIdentityId,
      componentValueId: unkOnlySlotId,
    });
    assert.equal(componentConfirmUnknown.status, 400);
    assert.equal(componentConfirmUnknown.data?.error, 'candidate_id_required');

    db.upsertListValue({
      fieldKey: 'connection',
      value: 'unk',
      normalizedValue: 'unk',
      source: 'pipeline',
      enumPolicy: 'closed',
      acceptedCandidateId: null,
      needsReview: true,
      overridden: false,
      sourceTimestamp: new Date().toISOString(),
    });
    upsertStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: 'unk',
      selectedValue: 'unk',
      selectedCandidateId: null,
      confidenceScore: 0.2,
      aiConfirmSharedStatus: 'pending',
      userAcceptSharedStatus: null,
    });

    const unkEnumSlot = getEnumSlotIds(db, CATEGORY, 'connection', 'unk');
    assert.ok(unkEnumSlot.listValueId);
    assert.ok(unkEnumSlot.enumListId);
    const enumConfirmUnknown = await apiRawJson(baseUrl, 'POST', `/review-components/${CATEGORY}/enum-override`, {
      listValueId: unkEnumSlot.listValueId,
      enumListId: unkEnumSlot.enumListId,
      action: 'confirm',
      candidateId: 'global_connection_candidate',
    });
    assert.equal(enumConfirmUnknown.status, 400);
    assert.equal(enumConfirmUnknown.data?.error, 'unknown_value_not_actionable');

    const enumAcceptUnknown = await apiRawJson(baseUrl, 'POST', `/review-components/${CATEGORY}/enum-override`, {
      listValueId: unkEnumSlot.listValueId,
      enumListId: unkEnumSlot.enumListId,
      action: 'accept',
      candidateId: 'global_connection_candidate',
    });
    assert.equal(enumAcceptUnknown.status, 400);
    assert.equal(enumAcceptUnknown.data?.error, 'unknown_value_not_actionable');
  });
});
