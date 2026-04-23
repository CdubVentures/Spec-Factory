import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../specDb.js';
import { fingerprintValue } from '../valueFingerprint.js';

function insertRefs(db, candidateId, refs) {
  for (const r of refs) {
    db.insertFieldCandidateEvidence({
      candidateId,
      url: r.url,
      tier: r.tier ?? 'tier1',
      confidence: r.confidence,
      httpStatus: 200,
      accepted: 1,
      evidenceKind: r.kind ?? null,
      supportingEvidence: r.quote ?? null,
    });
  }
}

describe('countPooledQualifyingEvidenceByFingerprint', () => {
  let db;
  let testDir;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pooled-ev-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
  });

  after(() => {
    try { db.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('pools refs across multiple candidate rows sharing a fingerprint', () => {
    const productId = 'p-pool-1';
    const fieldKey = 'sensor_link';

    db.insertFieldCandidate({
      productId, fieldKey, sourceId: 'pool-a', sourceType: 'test',
      value: 'PAW3395', unit: null, confidence: 90, model: '',
      validationJson: {}, metadataJson: {},
    });
    const a = db.getFieldCandidateBySourceId(productId, fieldKey, 'pool-a');

    db.insertFieldCandidate({
      productId, fieldKey, sourceId: 'pool-b', sourceType: 'test',
      value: 'paw3395', unit: null, confidence: 80, model: '',
      validationJson: {}, metadataJson: {},
    });
    const b = db.getFieldCandidateBySourceId(productId, fieldKey, 'pool-b');

    assert.equal(a.value_fingerprint, b.value_fingerprint);

    insertRefs(db, a.id, [
      { url: 'https://ex.com/a1', confidence: 90 },
      { url: 'https://ex.com/a2', confidence: 50 },
    ]);
    insertRefs(db, b.id, [
      { url: 'https://ex.com/b1', confidence: 80 },
    ]);

    const total = db.countPooledQualifyingEvidenceByFingerprint({
      productId, fieldKey,
      fingerprint: a.value_fingerprint,
      variantId: null,
      minConfidence: 0.7,
    });
    assert.equal(total, 2, 'expected 2 refs at/above 70% (a1@90, b1@80) — a2@50 excluded');
  });

  it('NULL evidence.confidence counts as qualifying (legacy tolerance)', () => {
    const productId = 'p-pool-2';
    const fieldKey = 'sensor_link';
    db.insertFieldCandidate({
      productId, fieldKey, sourceId: 'pool-null', sourceType: 'test',
      value: 'Optical', unit: null, confidence: 90, model: '',
      validationJson: {}, metadataJson: {},
    });
    const row = db.getFieldCandidateBySourceId(productId, fieldKey, 'pool-null');
    db.db.prepare(
      `INSERT INTO field_candidate_evidence (candidate_id, url, tier, confidence, accepted)
       VALUES (?, ?, ?, NULL, 1)`
    ).run(row.id, 'https://ex.com/legacy', 'tier1');

    const total = db.countPooledQualifyingEvidenceByFingerprint({
      productId, fieldKey,
      fingerprint: row.value_fingerprint,
      variantId: null,
      minConfidence: 0.7,
    });
    assert.equal(total, 1, 'NULL evidence.confidence must count as qualifying');
  });

  it('dedupes the same URL across multiple rows in the pool', () => {
    const productId = 'p-pool-3';
    const fieldKey = 'sensor_link';

    db.insertFieldCandidate({
      productId, fieldKey, sourceId: 'dup-a', sourceType: 'test',
      value: 'Hall Effect', unit: null, confidence: 90, model: '',
      validationJson: {}, metadataJson: {},
    });
    const a = db.getFieldCandidateBySourceId(productId, fieldKey, 'dup-a');

    db.insertFieldCandidate({
      productId, fieldKey, sourceId: 'dup-b', sourceType: 'test',
      value: 'hall effect', unit: null, confidence: 85, model: '',
      validationJson: {}, metadataJson: {},
    });
    const b = db.getFieldCandidateBySourceId(productId, fieldKey, 'dup-b');

    insertRefs(db, a.id, [{ url: 'https://shared.example/x', confidence: 90 }]);
    insertRefs(db, b.id, [{ url: 'https://shared.example/x', confidence: 95 }]);

    const total = db.countPooledQualifyingEvidenceByFingerprint({
      productId, fieldKey,
      fingerprint: a.value_fingerprint,
      variantId: null,
      minConfidence: 0.7,
    });
    assert.equal(total, 1, 'shared URL across rows should count once');
  });
});

describe('listFieldBuckets', () => {
  let db;
  let testDir;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buckets-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
  });

  after(() => {
    try { db.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('groups candidates into buckets keyed by value_fingerprint', () => {
    const productId = 'p-buck-1';
    const fieldKey = 'sensor_link';

    db.insertFieldCandidate({
      productId, fieldKey, sourceId: 'b1', sourceType: 'test',
      value: 'PAW3395', unit: null, confidence: 90, model: '',
      validationJson: {}, metadataJson: {},
    });
    db.insertFieldCandidate({
      productId, fieldKey, sourceId: 'b2', sourceType: 'test',
      value: 'paw3395', unit: null, confidence: 85, model: '',
      validationJson: {}, metadataJson: {},
    });
    db.insertFieldCandidate({
      productId, fieldKey, sourceId: 'b3', sourceType: 'test',
      value: 'HERO 25K', unit: null, confidence: 70, model: '',
      validationJson: {}, metadataJson: {},
    });

    const buckets = db.listFieldBuckets({ productId, fieldKey, variantId: null });
    assert.equal(buckets.length, 2);

    const paw = buckets.find(b => b.value_fingerprint === fingerprintValue('PAW3395'));
    const hero = buckets.find(b => b.value_fingerprint === fingerprintValue('HERO 25K'));

    assert.ok(paw, 'PAW3395 bucket missing');
    assert.ok(hero, 'HERO 25K bucket missing');
    assert.equal(paw.member_count, 2);
    assert.equal(hero.member_count, 1);
    assert.ok(Array.isArray(paw.member_ids));
    assert.equal(paw.member_ids.length, 2);
  });

  it('scopes by variantId when provided', () => {
    const productId = 'p-buck-2';
    const fieldKey = 'price';

    db.insertFieldCandidate({
      productId, fieldKey, sourceId: 'va-1', sourceType: 'test',
      value: '100', unit: null, confidence: 90, model: '', variantId: 'v-black',
      validationJson: {}, metadataJson: {},
    });
    db.insertFieldCandidate({
      productId, fieldKey, sourceId: 'va-2', sourceType: 'test',
      value: '120', unit: null, confidence: 90, model: '', variantId: 'v-white',
      validationJson: {}, metadataJson: {},
    });

    const black = db.listFieldBuckets({ productId, fieldKey, variantId: 'v-black' });
    assert.equal(black.length, 1);
    assert.equal(black[0].value_fingerprint, fingerprintValue('100'));
  });
});

describe('hasPublishedValue', () => {
  let db;
  let testDir;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'has-pub-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
  });

  after(() => {
    try { db.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('returns false when no resolved candidate exists', () => {
    assert.equal(db.hasPublishedValue('p-empty', 'sensor_link'), false);
  });

  it('returns true after markFieldCandidateResolved', () => {
    db.insertFieldCandidate({
      productId: 'p-has', fieldKey: 'sensor_link',
      sourceId: 'has-1', sourceType: 'test',
      value: 'PAW3395', unit: null, confidence: 90, model: '',
      validationJson: {}, metadataJson: {},
    });
    assert.equal(db.hasPublishedValue('p-has', 'sensor_link'), false);
    db.markFieldCandidateResolved('p-has', 'sensor_link', 'PAW3395');
    assert.equal(db.hasPublishedValue('p-has', 'sensor_link'), true);
  });
});
