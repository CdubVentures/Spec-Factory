import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../specDb.js';
import { fingerprintValue } from '../valueFingerprint.js';

describe('value_fingerprint column + backfill', () => {
  let db;
  let testDir;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfp-mig-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
  });

  after(() => {
    try { db.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('field_candidates table has value_fingerprint column', () => {
    const cols = db.db.pragma('table_info(field_candidates)');
    assert.ok(cols.some(c => c.name === 'value_fingerprint'), 'expected value_fingerprint column');
  });

  it('inserting a scalar candidate writes its fingerprint', () => {
    db.insertFieldCandidate({
      productId: 'p-vfp-1', fieldKey: 'sensor_link',
      sourceId: 'vfp-scalar-1', sourceType: 'test',
      value: 'PAW3395', unit: null, confidence: 90,
      model: '', validationJson: {}, metadataJson: {},
    });
    const row = db.getFieldCandidateBySourceId('p-vfp-1', 'sensor_link', 'vfp-scalar-1');
    assert.equal(row.value_fingerprint, 'paw3395');
  });

  it('inserting a case-variant scalar produces the SAME fingerprint', () => {
    db.insertFieldCandidate({
      productId: 'p-vfp-2', fieldKey: 'sensor_link',
      sourceId: 'vfp-scalar-a', sourceType: 'test',
      value: 'paw3395', unit: null, confidence: 90,
      model: '', validationJson: {}, metadataJson: {},
    });
    db.insertFieldCandidate({
      productId: 'p-vfp-2', fieldKey: 'sensor_link',
      sourceId: 'vfp-scalar-b', sourceType: 'test',
      value: '  PAW3395  ', unit: null, confidence: 90,
      model: '', validationJson: {}, metadataJson: {},
    });
    const a = db.getFieldCandidateBySourceId('p-vfp-2', 'sensor_link', 'vfp-scalar-a');
    const b = db.getFieldCandidateBySourceId('p-vfp-2', 'sensor_link', 'vfp-scalar-b');
    assert.equal(a.value_fingerprint, b.value_fingerprint);
  });

  it('inserting a list candidate produces a set-equality fingerprint', () => {
    db.insertFieldCandidate({
      productId: 'p-vfp-3', fieldKey: 'colors',
      sourceId: 'vfp-list-a', sourceType: 'test',
      value: JSON.stringify(['Black', 'White']), unit: null, confidence: 80,
      model: '', validationJson: {}, metadataJson: {},
    });
    db.insertFieldCandidate({
      productId: 'p-vfp-3', fieldKey: 'colors',
      sourceId: 'vfp-list-b', sourceType: 'test',
      value: JSON.stringify(['WHITE', 'black']), unit: null, confidence: 80,
      model: '', validationJson: {}, metadataJson: {},
    });
    const a = db.getFieldCandidateBySourceId('p-vfp-3', 'colors', 'vfp-list-a');
    const b = db.getFieldCandidateBySourceId('p-vfp-3', 'colors', 'vfp-list-b');
    assert.equal(a.value_fingerprint, b.value_fingerprint);
    const expected = fingerprintValue(['Black', 'White']);
    assert.equal(a.value_fingerprint, expected);
  });

  it('list candidates with different sets produce different fingerprints', () => {
    db.insertFieldCandidate({
      productId: 'p-vfp-4', fieldKey: 'colors',
      sourceId: 'vfp-list-xy', sourceType: 'test',
      value: JSON.stringify(['x', 'y']), unit: null, confidence: 80,
      model: '', validationJson: {}, metadataJson: {},
    });
    db.insertFieldCandidate({
      productId: 'p-vfp-4', fieldKey: 'colors',
      sourceId: 'vfp-list-xyz', sourceType: 'test',
      value: JSON.stringify(['x', 'y', 'z']), unit: null, confidence: 80,
      model: '', validationJson: {}, metadataJson: {},
    });
    const a = db.getFieldCandidateBySourceId('p-vfp-4', 'colors', 'vfp-list-xy');
    const b = db.getFieldCandidateBySourceId('p-vfp-4', 'colors', 'vfp-list-xyz');
    assert.notEqual(a.value_fingerprint, b.value_fingerprint);
  });

  it('upsert also writes the fingerprint', () => {
    db.upsertFieldCandidate({
      productId: 'p-vfp-5', fieldKey: 'weight',
      value: '58', confidence: 90,
      sourceId: 'vfp-ups-1', sourceType: 'test',
    });
    const row = db.getFieldCandidateBySourceId('p-vfp-5', 'weight', 'vfp-ups-1');
    assert.equal(row.value_fingerprint, '58');
  });

  it('backfill populates empty fingerprints without touching already-populated ones', () => {
    db.insertFieldCandidate({
      productId: 'p-vfp-6', fieldKey: 'sensor_link',
      sourceId: 'vfp-bf-seed', sourceType: 'test',
      value: 'Hall Effect', unit: null, confidence: 80,
      model: '', validationJson: {}, metadataJson: {},
    });
    db.db.prepare('UPDATE field_candidates SET value_fingerprint = ? WHERE source_id = ?')
      .run('', 'vfp-bf-seed');
    const before = db.getFieldCandidateBySourceId('p-vfp-6', 'sensor_link', 'vfp-bf-seed');
    assert.equal(before.value_fingerprint, '', 'seed precondition: fingerprint emptied');

    db.backfillValueFingerprints();

    const after = db.getFieldCandidateBySourceId('p-vfp-6', 'sensor_link', 'vfp-bf-seed');
    assert.equal(after.value_fingerprint, 'hall effect');
  });

  it('index idx_fc_fingerprint exists on (product_id, field_key, value_fingerprint, variant_id_key)', () => {
    const idx = db.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_fc_fingerprint'"
    ).get();
    assert.ok(idx, 'expected idx_fc_fingerprint index');
    assert.match(idx.sql, /value_fingerprint/);
  });
});
