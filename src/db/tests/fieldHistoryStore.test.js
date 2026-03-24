import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../specDb.js';

const TEST_DIR = path.join('.specfactory_tmp', '_test_field_history');
const DB_PATH = path.join(TEST_DIR, 'spec.sqlite');

describe('fieldHistoryStore', () => {
  let db;

  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    db = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
  });

  after(() => {
    db.close();
    try { fs.unlinkSync(DB_PATH); } catch { /* */ }
    try { fs.rmdirSync(TEST_DIR); } catch { /* */ }
  });

  it('upsert + get roundtrip', () => {
    const history = {
      existing_queries: ['mouse specs'],
      domains_tried: ['rtings.com'],
      query_count: 3,
      no_value_attempts: 1,
    };
    db.upsertFieldHistory({
      product_id: 'prod-1',
      field_key: 'weight',
      round: 0,
      run_id: 'run-001',
      history_json: JSON.stringify(history),
    });

    const result = db.getFieldHistories('prod-1');
    assert.deepEqual(result.weight, history);
  });

  it('UPSERT semantics — second write overwrites first', () => {
    const history1 = { query_count: 1, domains_tried: ['a.com'] };
    const history2 = { query_count: 5, domains_tried: ['a.com', 'b.com'] };

    db.upsertFieldHistory({
      product_id: 'prod-2',
      field_key: 'dpi',
      round: 0,
      run_id: 'run-001',
      history_json: JSON.stringify(history1),
    });
    db.upsertFieldHistory({
      product_id: 'prod-2',
      field_key: 'dpi',
      round: 1,
      run_id: 'run-002',
      history_json: JSON.stringify(history2),
    });

    const result = db.getFieldHistories('prod-2');
    assert.deepEqual(result.dpi, history2);
  });

  it('getFieldHistories returns {} for unknown productId', () => {
    const result = db.getFieldHistories('nonexistent');
    assert.deepEqual(result, {});
  });

  it('getFieldHistories returns multiple fields', () => {
    db.upsertFieldHistory({
      product_id: 'prod-3',
      field_key: 'weight',
      round: 0,
      run_id: 'run-003',
      history_json: JSON.stringify({ query_count: 1 }),
    });
    db.upsertFieldHistory({
      product_id: 'prod-3',
      field_key: 'height',
      round: 0,
      run_id: 'run-003',
      history_json: JSON.stringify({ query_count: 2 }),
    });

    const result = db.getFieldHistories('prod-3');
    assert.equal(Object.keys(result).length, 2);
    assert.equal(result.weight.query_count, 1);
    assert.equal(result.height.query_count, 2);
  });

  it('deleteFieldHistories clears all rows for product', () => {
    db.upsertFieldHistory({
      product_id: 'prod-4',
      field_key: 'sensor',
      round: 0,
      run_id: 'run-004',
      history_json: JSON.stringify({ query_count: 1 }),
    });
    assert.equal(Object.keys(db.getFieldHistories('prod-4')).length, 1);

    db.deleteFieldHistories('prod-4');
    assert.deepEqual(db.getFieldHistories('prod-4'), {});
  });

  it('handles malformed JSON gracefully', () => {
    db.upsertFieldHistory({
      product_id: 'prod-5',
      field_key: 'bad_json',
      round: 0,
      run_id: 'run-005',
      history_json: '{broken',
    });
    const result = db.getFieldHistories('prod-5');
    assert.deepEqual(result.bad_json, {});
  });
});
