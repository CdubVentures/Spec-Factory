import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY,
  seedItemFieldState,
  withTempSpecDb,
} from './helpers/reviewGridStateRuntimeHarness.js';

describe('store methods — getKeyReviewStateById', () => {
  it('returns row by id', () => withTempSpecDb(async (specDb) => {
    const ifs = seedItemFieldState(specDb);
    const id = specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: 'mouse-1',
      fieldKey: 'dpi',
      itemFieldStateId: ifs.id,
    });

    const row = specDb.getKeyReviewStateById(id);
    assert.ok(row);
    assert.equal(row.id, Number(id));
    assert.equal(row.target_kind, 'grid_key');
  }));

  it('returns null for missing id', () => withTempSpecDb(async (specDb) => {
    assert.equal(specDb.getKeyReviewStateById(99999), null);
  }));

  it('returns null for invalid id', () => withTempSpecDb(async (specDb) => {
    assert.equal(specDb.getKeyReviewStateById(null), null);
    assert.equal(specDb.getKeyReviewStateById('abc'), null);
    assert.equal(specDb.getKeyReviewStateById(-1), null);
  }));
});

describe('store methods — updateKeyReviewSelectedCandidate', () => {
  it('updates selected candidate, value, and score', () => withTempSpecDb(async (specDb) => {
    const ifs = seedItemFieldState(specDb);
    const id = specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: 'mouse-1',
      fieldKey: 'dpi',
      itemFieldStateId: ifs.id,
    });

    specDb.updateKeyReviewSelectedCandidate({
      id,
      selectedCandidateId: 'cand-1',
      selectedValue: '25600',
      confidenceScore: 0.95,
    });

    const row = specDb.getKeyReviewStateById(id);
    assert.equal(row.selected_candidate_id, 'cand-1');
    assert.equal(row.selected_value, '25600');
    assert.equal(row.confidence_score, 0.95);
  }));

  it('preserves confidence_score when null via COALESCE', () => withTempSpecDb(async (specDb) => {
    const ifs = seedItemFieldState(specDb);
    const id = specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: 'mouse-1',
      fieldKey: 'dpi',
      itemFieldStateId: ifs.id,
      confidenceScore: 0.8,
    });

    specDb.updateKeyReviewSelectedCandidate({
      id,
      selectedCandidateId: 'cand-2',
      selectedValue: 'new',
      confidenceScore: null,
    });

    const row = specDb.getKeyReviewStateById(id);
    assert.equal(row.confidence_score, 0.8);
  }));
});

describe('store methods — getItemFieldStateByProductAndField', () => {
  it('returns row by product and field', () => withTempSpecDb(async (specDb) => {
    seedItemFieldState(specDb, { productId: 'p1', fieldKey: 'f1', value: 'v1' });

    const row = specDb.getItemFieldStateByProductAndField('p1', 'f1');
    assert.ok(row);
    assert.equal(row.product_id, 'p1');
    assert.equal(row.field_key, 'f1');
    assert.equal(row.value, 'v1');
  }));

  it('returns null when not found', () => withTempSpecDb(async (specDb) => {
    assert.equal(specDb.getItemFieldStateByProductAndField('no', 'no'), null);
  }));

  it('returns null for empty inputs', () => withTempSpecDb(async (specDb) => {
    assert.equal(specDb.getItemFieldStateByProductAndField('', 'f1'), null);
    assert.equal(specDb.getItemFieldStateByProductAndField('p1', ''), null);
  }));
});

describe('store methods — markItemFieldStateReviewComplete', () => {
  it('sets needs_ai_review=0 and ai_review_complete=1', () => withTempSpecDb(async (specDb) => {
    seedItemFieldState(specDb, { productId: 'p1', fieldKey: 'f1', needsAiReview: true, aiReviewComplete: false });

    specDb.markItemFieldStateReviewComplete('p1', 'f1');

    const row = specDb.getItemFieldStateByProductAndField('p1', 'f1');
    assert.equal(Boolean(row.needs_ai_review), false);
    assert.equal(Boolean(row.ai_review_complete), true);
  }));

  it('is a no-op for empty inputs', () => withTempSpecDb(async (specDb) => {
    seedItemFieldState(specDb, { productId: 'p1', fieldKey: 'f1', needsAiReview: true, aiReviewComplete: false });

    specDb.markItemFieldStateReviewComplete('', 'f1');
    specDb.markItemFieldStateReviewComplete('p1', '');

    const row = specDb.getItemFieldStateByProductAndField('p1', 'f1');
    assert.equal(Boolean(row.needs_ai_review), true);
  }));
});
