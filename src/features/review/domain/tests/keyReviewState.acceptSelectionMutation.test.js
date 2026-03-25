import test from 'node:test';
import assert from 'node:assert/strict';

import { applySharedLaneState } from '../keyReviewState.js';
import {
  CATEGORY,
  cleanupTempSpecDb,
  createTempSpecDb,
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
