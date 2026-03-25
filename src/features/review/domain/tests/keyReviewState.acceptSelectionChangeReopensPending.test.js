import test from 'node:test';
import assert from 'node:assert/strict';

import { applySharedLaneState } from '../keyReviewState.js';
import {
  CATEGORY,
  cleanupTempSpecDb,
  createTempSpecDb,
  ensureEnumSlot,
} from './helpers/keyReviewStateHarness.js';

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
