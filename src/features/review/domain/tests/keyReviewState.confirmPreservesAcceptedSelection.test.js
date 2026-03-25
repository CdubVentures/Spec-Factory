import test from 'node:test';
import assert from 'node:assert/strict';

import { applySharedLaneState } from '../keyReviewState.js';
import {
  CATEGORY,
  cleanupTempSpecDb,
  createTempSpecDb,
  ensureEnumSlot,
} from './helpers/keyReviewStateHarness.js';

test('applySharedLaneState(confirm) does not change selected candidate/value or clear shared accept', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const enumSlot = ensureEnumSlot(specDb, 'connection', 'Wireless');
    const id = specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: 'wireless',
      listValueId: enumSlot.id,
      enumListId: enumSlot.list_id ?? null,
      selectedValue: 'Wireless',
      selectedCandidateId: 'cand_wireless',
      confidenceScore: 0.92,
      aiConfirmSharedStatus: 'pending',
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
      confidenceScore: 0.31,
      laneAction: 'confirm',
    });

    assert.equal(updated.id, id);
    assert.equal(updated.selected_candidate_id, 'cand_wireless');
    assert.equal(updated.selected_value, 'Wireless');
    assert.equal(updated.user_accept_shared_status, 'accepted');
    assert.equal(updated.ai_confirm_shared_status, 'confirmed');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
