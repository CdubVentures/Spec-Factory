import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY,
  createTempSpecDb,
  cleanupTempSpecDb,
  seedItemFieldState,
  makeRuntime,
} from './helpers/reviewGridStateRuntimeHarness.js';

describe('markPrimaryLaneReviewedInItemState — characterization', () => {
  it('sets needs_ai_review=0 and ai_review_complete=1 for matching item_field_state', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
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
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('is a no-op when target_kind is not grid_key', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
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
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('is a no-op when item_identifier is missing', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
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
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

/* --- syncItemFieldStateFromPrimaryLaneAccept --- */

describe('syncItemFieldStateFromPrimaryLaneAccept — characterization', () => {
  it('upserts item_field_state from keyReviewState selected value', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb, { value: 'old-value' });
      const ifs = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'mouse-1', 'dpi');

      const krs = {
        target_kind: 'grid_key',
        item_identifier: 'mouse-1',
        field_key: 'dpi',
        selected_candidate_id: null,
        selected_value: 'new-value',
        confidence_score: 0.95,
        ai_confirm_primary_status: 'confirmed',
      };
      runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, krs);

      const updated = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'mouse-1', 'dpi');
      assert.equal(updated.value, 'new-value');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('is a no-op when target_kind is not grid_key', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
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
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('skips when selected value is not meaningful and no current row exists', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      // no item_field_state seeded for this product/field

      runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, {
        target_kind: 'grid_key',
        item_identifier: 'no-product',
        field_key: 'no-field',
        selected_value: 'unknown',
        selected_candidate_id: null,
      });

      const row = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'no-product', 'no-field');
      assert.equal(row, undefined);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('falls back to current value when selected_value is empty', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb, { value: 'existing-value', confidence: 0.8 });

      runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, {
        target_kind: 'grid_key',
        item_identifier: 'mouse-1',
        field_key: 'dpi',
        selected_value: null,
        selected_candidate_id: null,
        confidence_score: 0.99,
        ai_confirm_primary_status: 'confirmed',
      });

      const row = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'mouse-1', 'dpi');
      assert.equal(row.value, 'existing-value');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('does not throw when syncItemListLinkForFieldValue fails', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb, { value: '16000' });

      // This should not throw even though list link sync may find no matching list values
      runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, {
        target_kind: 'grid_key',
        item_identifier: 'mouse-1',
        field_key: 'dpi',
        selected_value: '16000',
        selected_candidate_id: null,
        confidence_score: 0.9,
        ai_confirm_primary_status: 'confirmed',
      });
      assert.ok(true, 'did not throw');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

/* --- syncPrimaryLaneAcceptFromItemSelection --- */

describe('syncPrimaryLaneAcceptFromItemSelection — characterization', () => {
  it('ensures key_review_state and updates selected candidate/value/score', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
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
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('creates audit trail entry', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
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
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null when ensureGridKeyReviewState returns null', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      // No item_field_state seeded — ensureGridKeyReviewState will return null

      const result = runtime.syncPrimaryLaneAcceptFromItemSelection({
        specDb,
        category: CATEGORY,
        productId: 'nonexistent',
        fieldKey: 'nope',
      });

      assert.equal(result, null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

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

/* ------------------------------------------------------------------ */
/*  Phase 1: Store method tests                                        */
/* ------------------------------------------------------------------ */
