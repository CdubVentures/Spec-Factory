import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrateFieldCandidatesToSourceCentric } from '../specDbMigrations.js';

const TEST_DIR = path.join('.tmp', '_test_fc_migration');
const DB_PATH = path.join(TEST_DIR, 'spec.sqlite');

// WHY: Minimal schema with OLD UNIQUE(value) constraint for migration testing.
const OLD_SCHEMA = `
CREATE TABLE IF NOT EXISTS field_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  product_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  value TEXT,
  unit TEXT DEFAULT NULL,
  confidence REAL DEFAULT 0,
  source_count INTEGER DEFAULT 1,
  sources_json TEXT DEFAULT '[]',
  validation_json TEXT DEFAULT '{}',
  metadata_json TEXT DEFAULT '{}',
  status TEXT DEFAULT 'candidate',
  source_id TEXT DEFAULT '',
  source_type TEXT DEFAULT '',
  model TEXT DEFAULT '',
  submitted_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, product_id, field_key, value)
);
`;

describe('migrateFieldCandidatesToSourceCentric', () => {
  let db;

  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    try { fs.unlinkSync(DB_PATH); } catch { /* */ }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(OLD_SCHEMA);

    // Seed ALL test data before migration runs

    // 1. Single-source row
    db.prepare(`INSERT INTO field_candidates (category, product_id, field_key, value, confidence, source_count, sources_json, validation_json, metadata_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, '{}', '{}', 'candidate')`)
      .run('mouse', 'p1', 'weight', '58', 92, 1,
        JSON.stringify([{ source: 'cef', model: 'gemini', confidence: 92, run_id: 'cef-1', run_number: 1 }]));

    // 2. Multi-source row (2 sources → should explode into 2 rows)
    db.prepare(`INSERT INTO field_candidates (category, product_id, field_key, value, confidence, source_count, sources_json, validation_json, metadata_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, '{}', '{}', 'candidate')`)
      .run('mouse', 'p2', 'weight', '58', 95, 2,
        JSON.stringify([
          { source: 'cef', model: 'gemini', confidence: 80, run_number: 1 },
          { source: 'pipeline', model: 'gpt-5', confidence: 95, run_id: 'run-abc' },
        ]));

    // 3. Empty sources_json
    db.prepare(`INSERT INTO field_candidates (category, product_id, field_key, value, confidence, source_count, sources_json, validation_json, metadata_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, '{}', '{}', 'candidate')`)
      .run('mouse', 'p3', 'sensor', 'PAW3395', 50, 0, '[]');

    // 4. Row with unit, status=resolved, metadata, validation — for preservation test
    db.prepare(`INSERT INTO field_candidates (category, product_id, field_key, value, unit, confidence, source_count, sources_json, validation_json, metadata_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('mouse', 'p-preserve', 'weight', '58', 'g', 92, 1,
        JSON.stringify([{ source: 'cef', model: 'gemini', confidence: 92, run_number: 1 }]),
        JSON.stringify({ valid: true, repairs: [{ step: 'unit' }], rejections: [] }),
        JSON.stringify({ color_names: { black: 'Black' } }),
        'resolved');

    // Run migration ONCE
    migrateFieldCandidatesToSourceCentric(db);
  });

  after(() => {
    db.close();
    try { fs.unlinkSync(DB_PATH); } catch { /* */ }
    try { fs.rmdirSync(TEST_DIR); } catch { /* */ }
  });

  it('single-source row: 1:1 mapping with source_id', () => {
    const rows = db.prepare('SELECT * FROM field_candidates WHERE product_id = ? AND field_key = ?').all('p1', 'weight');
    assert.equal(rows.length, 1);
    assert.ok(rows[0].source_id, 'should have source_id');
    assert.equal(rows[0].source_type, 'cef');
    assert.equal(rows[0].model, 'gemini');
    assert.equal(rows[0].value, '58');
    assert.equal(rows[0].confidence, 92);
  });

  it('multi-source row: exploded into N rows', () => {
    const rows = db.prepare('SELECT * FROM field_candidates WHERE product_id = ? AND field_key = ?').all('p2', 'weight');
    assert.equal(rows.length, 2, `expected 2 rows, got ${rows.length}`);
    const sourceIds = rows.map(r => r.source_id);
    assert.ok(sourceIds.every(s => s.length > 0), 'all rows should have source_id');
    assert.ok(new Set(sourceIds).size === 2, 'source_ids should be unique');
    const types = rows.map(r => r.source_type).sort();
    assert.deepEqual(types, ['cef', 'pipeline']);
  });

  it('empty sources_json: gets synthetic legacy source_id', () => {
    const rows = db.prepare('SELECT * FROM field_candidates WHERE product_id = ? AND field_key = ?').all('p3', 'sensor');
    assert.equal(rows.length, 1);
    assert.ok(rows[0].source_id.startsWith('legacy-'), `expected legacy- prefix, got ${rows[0].source_id}`);
  });

  it('new UNIQUE constraint allows same value with different source_ids', () => {
    db.prepare(`INSERT INTO field_candidates (category, product_id, field_key, value, confidence, source_id, source_type, model, validation_json, metadata_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', 'candidate')`)
      .run('mouse', 'p-unique', 'weight', '58', 80, 'cef-p-unique-1', 'cef', 'gemini');

    db.prepare(`INSERT INTO field_candidates (category, product_id, field_key, value, confidence, source_id, source_type, model, validation_json, metadata_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', 'candidate')`)
      .run('mouse', 'p-unique', 'weight', '58', 95, 'cef-p-unique-2', 'cef', 'gpt-5');

    const rows = db.prepare('SELECT * FROM field_candidates WHERE product_id = ? AND field_key = ?').all('p-unique', 'weight');
    assert.equal(rows.length, 2);
  });

  it('idempotent: running twice is safe', () => {
    const countBefore = db.prepare('SELECT COUNT(*) as c FROM field_candidates').get().c;
    migrateFieldCandidatesToSourceCentric(db);
    const countAfter = db.prepare('SELECT COUNT(*) as c FROM field_candidates').get().c;
    assert.equal(countAfter, countBefore);
  });

  it('preserves status, unit, metadata_json, validation_json', () => {
    const rows = db.prepare('SELECT * FROM field_candidates WHERE product_id = ? AND field_key = ?').all('p-preserve', 'weight');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].unit, 'g');
    assert.equal(rows[0].status, 'resolved');
    const validation = JSON.parse(rows[0].validation_json);
    assert.equal(validation.repairs[0].step, 'unit');
    const meta = JSON.parse(rows[0].metadata_json);
    assert.equal(meta.color_names.black, 'Black');
  });

  it('old columns source_count and sources_json are dropped', () => {
    const cols = db.prepare("PRAGMA table_info('field_candidates')").all().map(c => c.name);
    assert.ok(!cols.includes('source_count'), 'source_count should be dropped');
    assert.ok(!cols.includes('sources_json'), 'sources_json should be dropped');
    assert.ok(cols.includes('source_id'), 'source_id should exist');
    assert.ok(cols.includes('source_type'), 'source_type should exist');
    assert.ok(cols.includes('model'), 'model should exist');
  });
});
