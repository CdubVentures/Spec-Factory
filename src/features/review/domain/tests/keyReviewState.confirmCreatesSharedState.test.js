import test from 'node:test';
import assert from 'node:assert/strict';

import { applySharedLaneState } from '../keyReviewState.js';
import {
  CATEGORY,
  cleanupTempSpecDb,
  createTempSpecDb,
  ensureEnumSlot,
} from './helpers/keyReviewStateHarness.js';

test('applySharedLaneState(confirm) on new row creates state without auto-accept', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const enumSlot = ensureEnumSlot(specDb, 'cable_type', 'USB-C');
    const created = applySharedLaneState({
      specDb,
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'cable_type',
      enumValueNorm: 'usb-c',
      listValueId: enumSlot.id,
      enumListId: enumSlot.list_id ?? null,
      selectedCandidateId: null,
      selectedValue: 'USB-C',
      confidenceScore: 0.6,
      laneAction: 'confirm',
    });

    assert.ok(created?.id);
    assert.equal(created.selected_value, 'USB-C');
    assert.equal(created.selected_candidate_id, null);
    assert.equal(created.ai_confirm_shared_status, 'confirmed');
    assert.equal(created.user_accept_shared_status, null);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
