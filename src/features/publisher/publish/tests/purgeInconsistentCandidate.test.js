import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { purgeInconsistentCandidate } from '../purgeInconsistentCandidate.js';

describe('purgeInconsistentCandidate', () => {
  let db;
  let testDir;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-ic-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
  });

  after(() => {
    try { db.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('deletes the candidate row', () => {
    db.insertFieldCandidate({
      productId: 'p-purge-1', fieldKey: 'sensor_link',
      sourceId: 'bad-sub-1', sourceType: 'key_finder',
      value: 'PAW3395', unit: null, confidence: 50,
      model: '', validationJson: {}, metadataJson: {},
    });
    const row = db.getFieldCandidateBySourceId('p-purge-1', 'sensor_link', 'bad-sub-1');
    assert.ok(row, 'seed row must exist before purge');

    const result = purgeInconsistentCandidate({
      specDb: db,
      productId: 'p-purge-1',
      fieldKey: 'sensor_link',
      candidateId: row.id,
      sourceId: 'bad-sub-1',
    });

    assert.equal(result.status, 'purged');
    assert.equal(result.candidateId, row.id);
    assert.equal(db.getFieldCandidateBySourceId('p-purge-1', 'sensor_link', 'bad-sub-1'), null);
  });

  it('cascades evidence rows via FK ON DELETE CASCADE', () => {
    db.insertFieldCandidate({
      productId: 'p-purge-2', fieldKey: 'sensor_link',
      sourceId: 'bad-sub-2', sourceType: 'key_finder',
      value: 'PAW3395', unit: null, confidence: 50,
      model: '', validationJson: {}, metadataJson: {},
    });
    const row = db.getFieldCandidateBySourceId('p-purge-2', 'sensor_link', 'bad-sub-2');
    db.insertFieldCandidateEvidence({
      candidateId: row.id, url: 'https://ex/bad1', tier: 'tier1',
      confidence: 100, httpStatus: 200, accepted: 1,
      evidenceKind: null, supportingEvidence: null,
    });
    db.insertFieldCandidateEvidence({
      candidateId: row.id, url: 'https://ex/bad2', tier: 'tier1',
      confidence: 100, httpStatus: 200, accepted: 1,
      evidenceKind: null, supportingEvidence: null,
    });

    const evBefore = db.db.prepare('SELECT COUNT(*) AS n FROM field_candidate_evidence WHERE candidate_id = ?').get(row.id);
    assert.equal(evBefore.n, 2);

    purgeInconsistentCandidate({
      specDb: db, productId: 'p-purge-2', fieldKey: 'sensor_link',
      candidateId: row.id, sourceId: 'bad-sub-2',
    });

    const evAfter = db.db.prepare('SELECT COUNT(*) AS n FROM field_candidate_evidence WHERE candidate_id = ?').get(row.id);
    assert.equal(evAfter.n, 0, 'evidence must cascade on candidate delete');
  });

  it('is idempotent — purging a non-existent candidate returns noop', () => {
    const result = purgeInconsistentCandidate({
      specDb: db, productId: 'p-purge-nope', fieldKey: 'sensor_link',
      candidateId: 99999, sourceId: 'never-was',
    });
    assert.equal(result.status, 'noop');
  });

  it('leaves other candidates on the same product/field untouched', () => {
    db.insertFieldCandidate({
      productId: 'p-purge-3', fieldKey: 'sensor_link',
      sourceId: 'keeper', sourceType: 'key_finder',
      value: 'PAW3395', unit: null, confidence: 95,
      model: '', validationJson: {}, metadataJson: {},
    });
    db.insertFieldCandidate({
      productId: 'p-purge-3', fieldKey: 'sensor_link',
      sourceId: 'bad', sourceType: 'key_finder',
      value: 'HERO', unit: null, confidence: 40,
      model: '', validationJson: {}, metadataJson: {},
    });
    const keeper = db.getFieldCandidateBySourceId('p-purge-3', 'sensor_link', 'keeper');
    const bad = db.getFieldCandidateBySourceId('p-purge-3', 'sensor_link', 'bad');

    purgeInconsistentCandidate({
      specDb: db, productId: 'p-purge-3', fieldKey: 'sensor_link',
      candidateId: bad.id, sourceId: 'bad',
    });

    assert.ok(db.getFieldCandidateBySourceId('p-purge-3', 'sensor_link', 'keeper'), 'keeper must remain');
    assert.equal(db.getFieldCandidateBySourceId('p-purge-3', 'sensor_link', 'bad'), null);
  });
});
