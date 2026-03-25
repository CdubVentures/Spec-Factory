import test from 'node:test';
import assert from 'node:assert/strict';

import { applySharedLaneState } from '../keyReviewState.js';
import {
  CATEGORY,
  createTempSpecDb,
  cleanupTempSpecDb,
  ensureEnumSlot,
  ensureComponentIdentitySlot,
} from './helpers/keyReviewStateHarness.js';

test('applySharedLaneState(accept) updates selected candidate/value and does not auto-confirm', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const componentIdentityId = ensureComponentIdentitySlot(specDb, 'sensor', 'PAW3950', 'PixArt');
    specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: '__maker',
      componentIdentifier: 'sensor::paw3950::pixart',
      propertyKey: '__maker',
      componentIdentityId,
      selectedValue: 'PixArt',
      selectedCandidateId: null,
      confidenceScore: 0.5,
      aiConfirmSharedStatus: 'pending',
      userAcceptSharedStatus: null,
    });

    const updated = applySharedLaneState({
      specDb,
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: '__maker',
      componentIdentifier: 'sensor::paw3950::pixart',
      propertyKey: '__maker',
      componentIdentityId,
      selectedCandidateId: 'cand_pixart',
      selectedValue: 'PixArt',
      confidenceScore: 1,
      laneAction: 'accept',
    });

    assert.equal(updated.selected_candidate_id, 'cand_pixart');
    assert.equal(updated.selected_value, 'PixArt');
    assert.equal(updated.user_accept_shared_status, 'accepted');
    assert.equal(updated.ai_confirm_shared_status, 'pending');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('applySharedLaneState(accept) preserves confirmed shared status when selection is unchanged', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const enumSlot = ensureEnumSlot(specDb, 'connection', 'Wireless');
    specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: 'wireless',
      listValueId: enumSlot.id,
      enumListId: enumSlot.list_id ?? null,
      selectedValue: 'Wireless',
      selectedCandidateId: 'cand_wireless',
      confidenceScore: 1,
      aiConfirmSharedStatus: 'confirmed',
      userAcceptSharedStatus: 'accepted',
    });

    const updated = applySharedLaneState({
      specDb,
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: 'wireless',
      listValueId: enumSlot.id,
      enumListId: enumSlot.list_id ?? null,
      selectedCandidateId: 'cand_wireless',
      selectedValue: 'Wireless',
      confidenceScore: 1,
      laneAction: 'accept',
    });

    assert.equal(updated.ai_confirm_shared_status, 'confirmed');
    assert.equal(updated.user_accept_shared_status, 'accepted');
    assert.equal(updated.selected_candidate_id, 'cand_wireless');
    assert.equal(updated.selected_value, 'Wireless');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('applySharedLaneState(accept) reopens shared pending when selection changes', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const enumSlot = ensureEnumSlot(specDb, 'connection', 'Wireless');
    specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: 'wireless',
      listValueId: enumSlot.id,
      enumListId: enumSlot.list_id ?? null,
      selectedValue: 'Wireless',
      selectedCandidateId: 'cand_wireless',
      confidenceScore: 1,
      aiConfirmSharedStatus: 'confirmed',
      userAcceptSharedStatus: 'accepted',
    });

    const updated = applySharedLaneState({
      specDb,
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: 'wireless',
      listValueId: enumSlot.id,
      enumListId: enumSlot.list_id ?? null,
      selectedCandidateId: 'cand_bluetooth',
      selectedValue: 'Bluetooth',
      confidenceScore: 0.5,
      laneAction: 'accept',
    });

    assert.equal(updated.ai_confirm_shared_status, 'pending');
    assert.equal(updated.user_accept_shared_status, 'accepted');
    assert.equal(updated.selected_candidate_id, 'cand_bluetooth');
    assert.equal(updated.selected_value, 'Bluetooth');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
