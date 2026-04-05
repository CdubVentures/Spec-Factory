import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY,
  seedItemFieldState,
  makeRuntime,
  withTempSpecDb,
} from './helpers/reviewGridStateRuntimeHarness.js';

describe('ensureGridKeyReviewState — characterization', () => {
  it('returns existing key_review_state row when one matches', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    const ifs = seedItemFieldState(specDb);
    const id = specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: 'mouse-1',
      fieldKey: 'dpi',
      itemFieldStateId: ifs.id,
      selectedValue: '16000',
    });
    const existing = specDb.db.prepare('SELECT * FROM key_review_state WHERE id = ?').get(id);

    const result = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'mouse-1', 'dpi', ifs.id);

    assert.equal(result.id, existing.id);
  }));

  it('creates key_review_state when none exists, using itemFieldStateId lookup', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    const ifs = seedItemFieldState(specDb);

    const result = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'mouse-1', 'dpi', ifs.id);

    assert.ok(result);
    assert.equal(result.target_kind, 'grid_key');
    assert.equal(result.item_identifier, 'mouse-1');
    assert.equal(result.field_key, 'dpi');
    assert.equal(result.item_field_state_id, ifs.id);
  }));

  it('creates key_review_state using product+field fallback when itemFieldStateId is null', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    seedItemFieldState(specDb, { productId: 'mouse-2', fieldKey: 'weight' });

    const result = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'mouse-2', 'weight', null);

    assert.ok(result);
    assert.equal(result.target_kind, 'grid_key');
    assert.equal(result.item_identifier, 'mouse-2');
    assert.equal(result.field_key, 'weight');
  }));

  it('uses seed data (value, flags) when creating key_review_state from existing item_field_state', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    // WHY: In production, the seed is always the resolved fieldStateRow (a real row).
    // The seed provides value/confidence/flags for the new key_review_state.
    // We verify those seed values propagate into the created row.
    seedItemFieldState(specDb, {
      productId: 'mouse-3',
      fieldKey: 'sensor',
      value: 'PMW3360',
      confidence: 0.8,
      needsAiReview: true,
      aiReviewComplete: false,
      acceptedCandidateId: 'cand-9',
    });

    const result = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'mouse-3', 'sensor');

    assert.ok(result);
    assert.equal(result.selected_value, 'PMW3360');
    assert.equal(result.selected_candidate_id, 'cand-9');
    assert.equal(result.ai_confirm_primary_status, 'pending');
  }));

  it('returns null when all lookups fail and no seed', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();

    const result = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'no-such', 'no-field');

    assert.equal(result, null);
  }));

  it('derives aiConfirmPrimaryStatus and userAcceptPrimaryStatus from field state flags', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();

    // needs_ai_review=1 and ai_review_complete=0 -> pending
    seedItemFieldState(specDb, { productId: 'p1', fieldKey: 'f1', needsAiReview: true, aiReviewComplete: false });
    const r1 = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'p1', 'f1');
    assert.equal(r1.ai_confirm_primary_status, 'pending');
    assert.equal(r1.user_accept_primary_status, null);

    // ai_review_complete=1 -> confirmed
    seedItemFieldState(specDb, { productId: 'p2', fieldKey: 'f2', needsAiReview: false, aiReviewComplete: true });
    const r2 = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'p2', 'f2');
    assert.equal(r2.ai_confirm_primary_status, 'confirmed');

    // overridden -> userAcceptPrimaryStatus = accepted
    seedItemFieldState(specDb, { productId: 'p3', fieldKey: 'f3', overridden: true, needsAiReview: false, aiReviewComplete: true });
    const r3 = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'p3', 'f3');
    assert.equal(r3.user_accept_primary_status, 'accepted');
  }));
});

describe('resolveKeyReviewForLaneMutation — characterization', () => {
  it('resolves by explicit positive id', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    const ifs = seedItemFieldState(specDb);
    const id = specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: 'mouse-1',
      fieldKey: 'dpi',
      itemFieldStateId: ifs.id,
    });

    const result = runtime.resolveKeyReviewForLaneMutation(specDb, CATEGORY, { id });

    assert.equal(result.error, null);
    assert.equal(result.stateRow.id, id);
  }));

  it('returns not_found error for valid but missing id', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();

    const result = runtime.resolveKeyReviewForLaneMutation(specDb, CATEGORY, { id: 99999 });

    assert.equal(result.error, 'key_review_state_id_not_found');
    assert.equal(result.stateRow, null);
  }));

  it('returns specdb_not_ready when specDb is null', () => {
    const runtime = makeRuntime();

    const result = runtime.resolveKeyReviewForLaneMutation(null, CATEGORY, {});

    assert.equal(result.error, 'specdb_not_ready');
  });
});
