import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  applySharedLaneState,
  buildComponentIdentifier,
  cleanupTempSpecDb,
  createTempSpecDb,
  getComponentValueId,
} from './helpers/componentReviewHarness.js';

test('G8 - applySharedLaneState returned row matches DB state (atomic write)', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'PAW3950',
      maker: 'PixArt',
      links: [],
      source: 'pipeline',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      propertyKey: 'dpi_max',
      value: '35000',
      confidence: 0.9,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: null,
      needsReview: true,
      overridden: false,
      constraints: [],
    });
    const componentIdentifier = buildComponentIdentifier('sensor', 'PAW3950', 'PixArt');
    const componentValueId = getComponentValueId(specDb, 'sensor', 'PAW3950', 'PixArt', 'dpi_max');
    assert.ok(componentValueId, 'expected component value slot id');

    const resultA = applySharedLaneState({
      specDb,
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'dpi_max',
      componentIdentifier,
      propertyKey: 'dpi_max',
      componentValueId,
      selectedCandidateId: 'cand_a',
      selectedValue: '35000',
      confidenceScore: 0.9,
      laneAction: 'accept',
    });
    assert.ok(resultA, 'accept should return a state row');
    assert.equal(resultA.user_accept_shared_status, 'accepted');
    assert.equal(resultA.ai_confirm_shared_status, 'pending');
    assert.equal(resultA.selected_value, '35000');
    assert.equal(resultA.selected_candidate_id, 'cand_a');

    const dbRowAfterAccept = specDb.db.prepare(
      'SELECT * FROM key_review_state WHERE id = ?',
    ).get(resultA.id);
    assert.equal(
      dbRowAfterAccept.selected_value,
      resultA.selected_value,
      'returned row must match DB state - no partial writes',
    );
    assert.equal(dbRowAfterAccept.user_accept_shared_status, resultA.user_accept_shared_status);
    assert.equal(dbRowAfterAccept.ai_confirm_shared_status, resultA.ai_confirm_shared_status);

    const resultB = applySharedLaneState({
      specDb,
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'dpi_max',
      componentIdentifier,
      propertyKey: 'dpi_max',
      componentValueId,
      selectedCandidateId: 'cand_b',
      selectedValue: '35000',
      confidenceScore: 0.95,
      laneAction: 'confirm',
    });
    assert.ok(resultB, 'confirm should return a state row');
    assert.equal(resultB.ai_confirm_shared_status, 'confirmed');

    const dbRowAfterConfirm = specDb.db.prepare(
      'SELECT * FROM key_review_state WHERE id = ?',
    ).get(resultB.id);
    assert.equal(
      dbRowAfterConfirm.ai_confirm_shared_status,
      resultB.ai_confirm_shared_status,
      'returned row must match DB state after confirm - no partial writes',
    );
    assert.equal(dbRowAfterConfirm.ai_confirm_shared_confidence, 1.0);

    const resultC = applySharedLaneState({
      specDb,
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'dpi_max',
      componentIdentifier,
      propertyKey: 'dpi_max',
      componentValueId,
      selectedCandidateId: 'cand_c',
      selectedValue: '26000',
      confidenceScore: 0.92,
      laneAction: 'accept',
    });
    assert.ok(resultC, 'second accept with changed value should return a state row');
    assert.equal(resultC.selected_value, '26000');
    assert.equal(resultC.selected_candidate_id, 'cand_c');
    assert.equal(resultC.user_accept_shared_status, 'accepted');
    assert.equal(
      resultC.ai_confirm_shared_status,
      'pending',
      'accept with changed selection should regress confirmed -> pending',
    );

    const dbRowAfterSecondAccept = specDb.db.prepare(
      'SELECT * FROM key_review_state WHERE id = ?',
    ).get(resultC.id);
    assert.equal(dbRowAfterSecondAccept.selected_value, '26000');
    assert.equal(dbRowAfterSecondAccept.ai_confirm_shared_status, 'pending');
    assert.equal(dbRowAfterSecondAccept.user_accept_shared_status, 'accepted');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
