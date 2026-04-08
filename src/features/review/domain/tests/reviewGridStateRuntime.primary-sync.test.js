import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY,
  seedItemFieldState,
  makeRuntime,
  withTempSpecDb,
} from './helpers/reviewGridStateRuntimeHarness.js';

describe('markPrimaryLaneReviewedInItemState — characterization', () => {
  it('sets needs_ai_review=0 and ai_review_complete=1 for matching item_field_state', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    seedItemFieldState(specDb, { needsAiReview: true, aiReviewComplete: false });

    runtime.markPrimaryLaneReviewedInItemState(specDb, CATEGORY, {
      target_kind: 'grid_key',
      item_identifier: 'mouse-1',
      field_key: 'dpi',
    });

    const row = specDb.db.prepare(
      'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
    ).get(CATEGORY, 'mouse-1', 'dpi');
    assert.equal(row.needs_ai_review, 0);
    assert.equal(row.ai_review_complete, 1);
  }));

  it('is a no-op when target_kind is not grid_key', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    seedItemFieldState(specDb, { needsAiReview: true, aiReviewComplete: false });

    runtime.markPrimaryLaneReviewedInItemState(specDb, CATEGORY, {
      target_kind: 'component_key',
      item_identifier: 'mouse-1',
      field_key: 'dpi',
    });

    const row = specDb.db.prepare(
      'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
    ).get(CATEGORY, 'mouse-1', 'dpi');
    assert.equal(row.needs_ai_review, 1);
  }));

  it('is a no-op when item_identifier is missing', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    seedItemFieldState(specDb, { needsAiReview: true, aiReviewComplete: false });

    runtime.markPrimaryLaneReviewedInItemState(specDb, CATEGORY, {
      target_kind: 'grid_key',
      item_identifier: '',
      field_key: 'dpi',
    });

    const row = specDb.db.prepare(
      'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
    ).get(CATEGORY, 'mouse-1', 'dpi');
    assert.equal(row.needs_ai_review, 1);
  }));
});

describe('syncItemFieldStateFromPrimaryLaneAccept — no-op stub (DB writes removed, publisher wiring pending)', () => {
  it('does not modify item_field_state (no-op stub)', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    seedItemFieldState(specDb, { value: 'old-value' });

    runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, {
      target_kind: 'grid_key',
      item_identifier: 'mouse-1',
      field_key: 'dpi',
      selected_candidate_id: null,
      selected_value: 'new-value',
      confidence_score: 0.95,
      ai_confirm_primary_status: 'confirmed',
    });

    const row = specDb.db.prepare(
      'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
    ).get(CATEGORY, 'mouse-1', 'dpi');
    assert.equal(row.value, 'old-value', 'value should remain unchanged — function is a no-op');
  }));

  it('is a no-op when target_kind is not grid_key', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    seedItemFieldState(specDb, { value: 'original' });

    runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, {
      target_kind: 'enum_key',
      item_identifier: 'mouse-1',
      field_key: 'dpi',
      selected_value: 'changed',
    });

    const row = specDb.db.prepare(
      'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
    ).get(CATEGORY, 'mouse-1', 'dpi');
    assert.equal(row.value, 'original');
  }));

  it('does not throw for any input', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, {
      target_kind: 'grid_key',
      item_identifier: 'mouse-1',
      field_key: 'dpi',
      selected_value: '16000',
    });
    assert.ok(true, 'did not throw');
  }));
});

describe('syncPrimaryLaneAcceptFromItemSelection — characterization', () => {
  it('ensures key_review_state and updates selected candidate/value/score', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    seedItemFieldState(specDb);

    const result = runtime.syncPrimaryLaneAcceptFromItemSelection({
      specDb,
      category: CATEGORY,
      productId: 'mouse-1',
      fieldKey: 'dpi',
      selectedCandidateId: 'cand-42',
      selectedValue: '25600',
      confidenceScore: 0.98,
      reason: 'test accept',
    });

    assert.ok(result);
    assert.equal(result.selected_candidate_id, 'cand-42');
    assert.equal(result.selected_value, '25600');
    assert.equal(result.user_accept_primary_status, 'accepted');
  }));

  it('creates audit trail entry', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();
    seedItemFieldState(specDb);

    const result = runtime.syncPrimaryLaneAcceptFromItemSelection({
      specDb,
      category: CATEGORY,
      productId: 'mouse-1',
      fieldKey: 'dpi',
      selectedCandidateId: null,
      selectedValue: 'manual',
      reason: 'User override',
    });

    const audits = specDb.db.prepare(
      'SELECT * FROM key_review_audit WHERE key_review_state_id = ?'
    ).all(result.id);
    assert.ok(audits.length >= 1);
    assert.equal(audits[0].event_type, 'user_accept');
    assert.equal(audits[0].new_value, 'accepted');
  }));

  it('returns null when ensureGridKeyReviewState returns null', () => withTempSpecDb(async (specDb) => {
    const runtime = makeRuntime();

    const result = runtime.syncPrimaryLaneAcceptFromItemSelection({
      specDb,
      category: CATEGORY,
      productId: 'nonexistent',
      fieldKey: 'nope',
    });

    assert.equal(result, null);
  }));

  it('returns null when specDb is falsy', () => {
    const runtime = makeRuntime();

    const result = runtime.syncPrimaryLaneAcceptFromItemSelection({
      specDb: null,
      category: CATEGORY,
      productId: 'mouse-1',
      fieldKey: 'dpi',
    });

    assert.equal(result, null);
  });
});
