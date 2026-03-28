// WHY: Verifies purgeStore cascade operations correctly delete child rows
// using the right FK column names (key_review_state_id, key_review_run_id, run_id).

import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { SpecDb } from '../specDb.js';

function createHarness() {
  const specDb = new SpecDb({ dbPath: ':memory:', category: '_test_purge' });
  return { specDb, db: specDb.db };
}

function count(db, table, where = '', ...params) {
  const sql = where ? `SELECT COUNT(*) as c FROM ${table} WHERE ${where}` : `SELECT COUNT(*) as c FROM ${table}`;
  return db.prepare(sql).get(...params).c;
}

function seedKeyReviewChain(db, { category = '_test_purge', targetKind = 'grid_key', itemId = 'prod-1' } = {}) {
  db.prepare(`INSERT INTO key_review_state (category, target_kind, item_identifier, field_key) VALUES (?, ?, ?, 'weight')`).run(category, targetKind, itemId);
  const stateId = db.prepare('SELECT last_insert_rowid() as id').get().id;
  db.prepare(`INSERT INTO key_review_runs (key_review_state_id, stage, status, provider, model_used, prompt_hash, response_schema_version, input_tokens, output_tokens, latency_ms, cost_usd, error, started_at, finished_at) VALUES (?, 'ai', 'ok', 'openai', 'gpt-4o', 'h', '1', 10, 5, 100, 0.01, '', datetime('now'), datetime('now'))`).run(stateId);
  db.prepare(`INSERT INTO key_review_audit (key_review_state_id, event_type, actor_type, actor_id, old_value, new_value, reason) VALUES (?, 'ai_confirm', 'ai', 'gpt-4o', '', 'confirmed', 'test')`).run(stateId);
  return { stateId };
}

describe('purgeStore — key review cascade', () => {
  it('deleteKeyReviewStatesByTargetKinds cascades through all child tables', () => {
    const { specDb, db } = createHarness();
    seedKeyReviewChain(db, { targetKind: 'component_key' });

    strictEqual(count(db, 'key_review_state'), 1);
    strictEqual(count(db, 'key_review_runs'), 1);
    strictEqual(count(db, 'key_review_audit'), 1);

    specDb.deleteKeyReviewStatesByTargetKinds('_test_purge', ['component_key']);

    strictEqual(count(db, 'key_review_state'), 0, 'state deleted');
    strictEqual(count(db, 'key_review_runs'), 0, 'runs cascaded');
    strictEqual(count(db, 'key_review_audit'), 0, 'audit cascaded');
  });

  it('does not delete unrelated target_kinds', () => {
    const { specDb, db } = createHarness();
    seedKeyReviewChain(db, { targetKind: 'grid_key' });
    seedKeyReviewChain(db, { targetKind: 'component_key' });

    specDb.deleteKeyReviewStatesByTargetKinds('_test_purge', ['component_key']);

    strictEqual(count(db, 'key_review_state', "target_kind = 'grid_key'"), 1, 'grid_key untouched');
    strictEqual(count(db, 'key_review_state', "target_kind = 'component_key'"), 0, 'component_key deleted');
  });
});

describe('purgeStore — purgeCategoryState', () => {
  it('cascades key review correctly for test category', () => {
    const { specDb, db } = createHarness();
    seedKeyReviewChain(db);

    specDb.purgeCategoryState('_test_purge');

    strictEqual(count(db, 'key_review_state'), 0, 'state deleted');
    strictEqual(count(db, 'key_review_runs'), 0, 'runs cascaded');
    strictEqual(count(db, 'key_review_audit'), 0, 'audit cascaded');
  });

  it('rejects non-test categories', () => {
    const { specDb } = createHarness();
    const result = specDb.purgeCategoryState('mouse');
    strictEqual(result.clearedKeyReview, 0);
  });

  it('does not throw on source_intel tables without category column', () => {
    const { specDb } = createHarness();
    // Should not throw — broken deletes should be removed or silently handled
    const result = specDb.purgeCategoryState('_test_purge');
    strictEqual(typeof result.clearedArtifacts, 'number');
  });
});

describe('purgeStore — purgeProductReviewState', () => {
  it('deletes candidates for the target product only', () => {
    const { specDb, db } = createHarness();

    db.prepare(`INSERT INTO candidates (candidate_id, category, product_id, field_key, value) VALUES ('c-keep', '_test_purge', 'prod-keep', 'weight', '100g')`).run();
    db.prepare(`INSERT INTO candidates (candidate_id, category, product_id, field_key, value) VALUES ('c-del', '_test_purge', 'prod-del', 'weight', '200g')`).run();
    db.prepare(`INSERT INTO item_field_state (category, product_id, field_key, value, confidence, source) VALUES ('_test_purge', 'prod-del', 'weight', '200g', 0.9, 'llm')`).run();

    specDb.purgeProductReviewState('_test_purge', 'prod-del');

    strictEqual(count(db, 'candidates', "product_id = 'prod-del'"), 0, 'target product candidates gone');
    strictEqual(count(db, 'candidates', "product_id = 'prod-keep'"), 1, 'other product candidates kept');
  });

  it('cascades key review for the product', () => {
    const { specDb, db } = createHarness();
    seedKeyReviewChain(db, { targetKind: 'grid_key', itemId: 'prod-target' });

    specDb.purgeProductReviewState('_test_purge', 'prod-target');

    strictEqual(count(db, 'key_review_state', "item_identifier = 'prod-target'"), 0, 'state deleted');
    strictEqual(count(db, 'key_review_runs'), 0, 'runs cascaded');
    strictEqual(count(db, 'key_review_audit'), 0, 'audit cascaded');
  });
});
