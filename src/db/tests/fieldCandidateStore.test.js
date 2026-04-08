import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../specDb.js';

const TEST_DIR = path.join('.workspace', 'db', '_test_field_candidate_store');
const DB_PATH = path.join(TEST_DIR, 'spec.sqlite');

function sampleCandidate(overrides = {}) {
  return {
    productId: 'mouse-001',
    fieldKey: 'weight',
    value: '58',
    confidence: 92,
    sourceCount: 1,
    sourcesJson: [{ artifact: '2db2b3f0...', url: 'https://www.razer.com/...', confidence: 92, run_id: 'run-1', submitted_at: '2026-04-05T18:00:00.000Z' }],
    validationJson: { valid: true, repairs: [], rejections: [] },
    ...overrides,
  };
}

describe('fieldCandidateStore', () => {
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

  it('upsert + get roundtrip preserves all fields', () => {
    const input = sampleCandidate();
    db.upsertFieldCandidate(input);

    const row = db.getFieldCandidate('mouse-001', 'weight', '58');
    assert.ok(row);
    assert.equal(row.category, 'mouse');
    assert.equal(row.product_id, 'mouse-001');
    assert.equal(row.field_key, 'weight');
    assert.equal(row.value, '58');
    assert.equal(row.confidence, 92);
    assert.equal(row.source_count, 1);
    assert.ok(row.id > 0);
    assert.ok(row.submitted_at);
    assert.ok(row.updated_at);
  });

  it('JSON columns survive roundtrip', () => {
    db.upsertFieldCandidate(sampleCandidate({
      productId: 'mouse-json',
      fieldKey: 'colors',
      value: '["black","white"]',
      sourcesJson: [
        { model: 'gemini-2.5-flash', confidence: 100, run_id: 'cef-1', submitted_at: '2026-04-04T00:00:00Z' },
        { model: 'gemini-2.5-flash-lite', confidence: 100, run_id: 'cef-2', submitted_at: '2026-04-05T00:00:00Z' },
      ],
      validationJson: { valid: true, repairs: [{ step: 'normalize', before: 'Grey', after: 'gray', rule: 'token_map' }], rejections: [] },
    }));

    const row = db.getFieldCandidate('mouse-json', 'colors', '["black","white"]');
    assert.ok(row);
    assert.ok(Array.isArray(row.sources_json));
    assert.equal(row.sources_json.length, 2);
    assert.equal(row.sources_json[0].model, 'gemini-2.5-flash');
    assert.ok(typeof row.validation_json === 'object');
    assert.equal(row.validation_json.valid, true);
    assert.equal(row.validation_json.repairs.length, 1);
    assert.equal(row.validation_json.repairs[0].step, 'normalize');
  });

  it('upsert conflict: same (product, field, value) updates existing row', () => {
    db.upsertFieldCandidate(sampleCandidate({
      productId: 'mouse-conflict',
      confidence: 80,
      sourceCount: 1,
    }));

    db.upsertFieldCandidate(sampleCandidate({
      productId: 'mouse-conflict',
      confidence: 95,
      sourceCount: 2,
      sourcesJson: [
        { artifact: 'aaa', confidence: 80, run_id: 'run-1', submitted_at: '2026-04-05T00:00:00Z' },
        { artifact: 'bbb', confidence: 95, run_id: 'run-2', submitted_at: '2026-04-06T00:00:00Z' },
      ],
    }));

    const row = db.getFieldCandidate('mouse-conflict', 'weight', '58');
    assert.ok(row);
    assert.equal(row.confidence, 95);
    assert.equal(row.source_count, 2);
    assert.equal(row.sources_json.length, 2);

    // Verify single row, not duplicate
    const all = db.getFieldCandidatesByProductAndField('mouse-conflict', 'weight');
    assert.equal(all.length, 1);
  });

  it('get returns null for unknown product', () => {
    const row = db.getFieldCandidate('nonexistent-999', 'weight', '58');
    assert.equal(row, null);
  });

  it('getByProductAndField returns multiple candidates for same field', () => {
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-multi', value: '58', confidence: 92 }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-multi', value: '57', confidence: 60 }));

    const rows = db.getFieldCandidatesByProductAndField('mouse-multi', 'weight');
    assert.equal(rows.length, 2);
    // Ordered by confidence DESC
    assert.equal(rows[0].value, '58');
    assert.equal(rows[1].value, '57');
  });

  it('getAllByProduct returns candidates across all fields', () => {
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-all', fieldKey: 'weight', value: '58' }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-all', fieldKey: 'sensor', value: 'Focus Pro 30K' }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-all', fieldKey: 'dpi', value: '30000' }));

    const rows = db.getAllFieldCandidatesByProduct('mouse-all');
    assert.equal(rows.length, 3);
    const fieldKeys = rows.map(r => r.field_key);
    assert.ok(fieldKeys.includes('weight'));
    assert.ok(fieldKeys.includes('sensor'));
    assert.ok(fieldKeys.includes('dpi'));
  });

  it('deleteByProduct removes all rows for product', () => {
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-del', fieldKey: 'weight', value: '58' }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-del', fieldKey: 'sensor', value: 'PAW3395' }));

    db.deleteFieldCandidatesByProduct('mouse-del');

    const rows = db.getAllFieldCandidatesByProduct('mouse-del');
    assert.equal(rows.length, 0);
  });

  it('deleteByProductAndField removes only that field, others untouched', () => {
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-delf', fieldKey: 'weight', value: '58' }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-delf', fieldKey: 'sensor', value: 'PAW3395' }));

    db.deleteFieldCandidatesByProductAndField('mouse-delf', 'weight');

    const remaining = db.getAllFieldCandidatesByProduct('mouse-delf');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].field_key, 'sensor');
  });

  it('category isolation: different categories do not leak', () => {
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-iso', fieldKey: 'weight', value: '58' }));

    // Create a second SpecDb with different category but same DB file
    const kbDb = new SpecDb({ dbPath: DB_PATH, category: 'keyboard' });
    kbDb.upsertFieldCandidate({
      productId: 'kb-iso',
      fieldKey: 'weight',
      value: '800',
      confidence: 50,
      sourceCount: 1,
      sourcesJson: [],
      validationJson: {},
    });

    const mouseRows = db.getAllFieldCandidatesByProduct('mouse-iso');
    assert.equal(mouseRows.length, 1);
    assert.equal(mouseRows[0].category, 'mouse');

    const kbRows = kbDb.getAllFieldCandidatesByProduct('kb-iso');
    assert.equal(kbRows.length, 1);
    assert.equal(kbRows[0].category, 'keyboard');

    kbDb.close();
  });

  it('source merge on re-upsert: confidence takes MAX', () => {
    db.upsertFieldCandidate(sampleCandidate({
      productId: 'mouse-merge',
      confidence: 80,
      sourceCount: 1,
      sourcesJson: [{ artifact: 'aaa', confidence: 80, run_id: 'run-1' }],
    }));

    // Second upsert with lower confidence — MAX should keep 80
    db.upsertFieldCandidate(sampleCandidate({
      productId: 'mouse-merge',
      confidence: 60,
      sourceCount: 2,
      sourcesJson: [
        { artifact: 'aaa', confidence: 80, run_id: 'run-1' },
        { artifact: 'bbb', confidence: 60, run_id: 'run-2' },
      ],
    }));

    const row = db.getFieldCandidate('mouse-merge', 'weight', '58');
    assert.ok(row);
    assert.equal(row.confidence, 80); // MAX(80, 60) = 80
    assert.equal(row.source_count, 2);
    assert.equal(row.sources_json.length, 2);
  });
});
