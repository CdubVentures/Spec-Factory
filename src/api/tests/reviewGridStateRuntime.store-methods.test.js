import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY,
  createTempSpecDb,
  cleanupTempSpecDb,
  seedItemFieldState,
  makeRuntime,
} from './helpers/reviewGridStateRuntimeHarness.js';

describe('store methods — getKeyReviewStateById', () => {
  it('returns row by id', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const ifs = seedItemFieldState(specDb);
      const id = specDb.upsertKeyReviewState({
        category: CATEGORY, targetKind: 'grid_key',
        itemIdentifier: 'mouse-1', fieldKey: 'dpi', itemFieldStateId: ifs.id,
      });

      const row = specDb.getKeyReviewStateById(id);
      assert.ok(row);
      assert.equal(row.id, Number(id));
      assert.equal(row.target_kind, 'grid_key');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null for missing id', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      assert.equal(specDb.getKeyReviewStateById(99999), null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null for invalid id', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      assert.equal(specDb.getKeyReviewStateById(null), null);
      assert.equal(specDb.getKeyReviewStateById('abc'), null);
      assert.equal(specDb.getKeyReviewStateById(-1), null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

describe('store methods — updateKeyReviewSelectedCandidate', () => {
  it('updates selected candidate, value, and score', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const ifs = seedItemFieldState(specDb);
      const id = specDb.upsertKeyReviewState({
        category: CATEGORY, targetKind: 'grid_key',
        itemIdentifier: 'mouse-1', fieldKey: 'dpi', itemFieldStateId: ifs.id,
      });

      specDb.updateKeyReviewSelectedCandidate({
        id, selectedCandidateId: 'cand-1', selectedValue: '25600', confidenceScore: 0.95,
      });

      const row = specDb.getKeyReviewStateById(id);
      assert.equal(row.selected_candidate_id, 'cand-1');
      assert.equal(row.selected_value, '25600');
      assert.equal(row.confidence_score, 0.95);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('preserves confidence_score when null via COALESCE', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const ifs = seedItemFieldState(specDb);
      const id = specDb.upsertKeyReviewState({
        category: CATEGORY, targetKind: 'grid_key',
        itemIdentifier: 'mouse-1', fieldKey: 'dpi', itemFieldStateId: ifs.id,
        confidenceScore: 0.8,
      });

      specDb.updateKeyReviewSelectedCandidate({
        id, selectedCandidateId: 'cand-2', selectedValue: 'new', confidenceScore: null,
      });

      const row = specDb.getKeyReviewStateById(id);
      assert.equal(row.confidence_score, 0.8);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

describe('store methods — getItemFieldStateByProductAndField', () => {
  it('returns row by product and field', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      seedItemFieldState(specDb, { productId: 'p1', fieldKey: 'f1', value: 'v1' });

      const row = specDb.getItemFieldStateByProductAndField('p1', 'f1');
      assert.ok(row);
      assert.equal(row.product_id, 'p1');
      assert.equal(row.field_key, 'f1');
      assert.equal(row.value, 'v1');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null when not found', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      assert.equal(specDb.getItemFieldStateByProductAndField('no', 'no'), null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null for empty inputs', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      assert.equal(specDb.getItemFieldStateByProductAndField('', 'f1'), null);
      assert.equal(specDb.getItemFieldStateByProductAndField('p1', ''), null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

describe('store methods — markItemFieldStateReviewComplete', () => {
  it('sets needs_ai_review=0 and ai_review_complete=1', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      seedItemFieldState(specDb, { productId: 'p1', fieldKey: 'f1', needsAiReview: true, aiReviewComplete: false });

      specDb.markItemFieldStateReviewComplete('p1', 'f1');

      const row = specDb.getItemFieldStateByProductAndField('p1', 'f1');
      assert.equal(Boolean(row.needs_ai_review), false);
      assert.equal(Boolean(row.ai_review_complete), true);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('is a no-op for empty inputs', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      seedItemFieldState(specDb, { productId: 'p1', fieldKey: 'f1', needsAiReview: true, aiReviewComplete: false });

      specDb.markItemFieldStateReviewComplete('', 'f1');
      specDb.markItemFieldStateReviewComplete('p1', '');

      const row = specDb.getItemFieldStateByProductAndField('p1', 'f1');
      assert.equal(Boolean(row.needs_ai_review), true);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});
