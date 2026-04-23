import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { evaluateFieldBuckets, checkEvidenceGate } from '../evidenceGate.js';

const scalarRule = {
  evidence: { min_evidence_refs: 2 },
  contract: { shape: 'scalar', type: 'string' },
};
const listWinnerRule = {
  evidence: { min_evidence_refs: 2 },
  contract: { shape: 'list', type: 'string', list_rules: { item_union: 'winner_only' } },
};
const listUnionRule = {
  evidence: { min_evidence_refs: 2 },
  contract: { shape: 'list', type: 'string', list_rules: { item_union: 'set_union' } },
};

function seedRow(db, { productId, fieldKey, sourceId, value, confidence = 90, variantId = null }) {
  db.insertFieldCandidate({
    productId, fieldKey, sourceId, sourceType: 'test',
    value: typeof value === 'string' ? value : JSON.stringify(value),
    unit: null, confidence, model: '', variantId,
    validationJson: {}, metadataJson: {},
  });
  return db.getFieldCandidateBySourceIdAndVariant(productId, fieldKey, sourceId, variantId);
}

function seedEvidence(db, candidateId, refs) {
  for (const r of refs) {
    db.insertFieldCandidateEvidence({
      candidateId,
      url: r.url,
      tier: r.tier ?? 'tier1',
      confidence: r.confidence,
      httpStatus: 200,
      accepted: 1,
      evidenceKind: r.kind ?? null,
      supportingEvidence: null,
    });
  }
}

describe('evaluateFieldBuckets — scalar', () => {
  let db;
  let testDir;

  beforeEach(() => {
    try { db?.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-buckets-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
  });

  after(() => {
    try { db?.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('min_evidence_refs=0 → every bucket qualifies and top wins', () => {
    const productId = 'p-ev-0';
    const fieldKey = 'sensor_link';
    seedRow(db, { productId, fieldKey, sourceId: 's-a', value: 'X', confidence: 90 });
    seedRow(db, { productId, fieldKey, sourceId: 's-b', value: 'Y', confidence: 80 });

    const res = evaluateFieldBuckets({
      specDb: db, productId, fieldKey,
      fieldRule: { ...scalarRule, evidence: { min_evidence_refs: 0 } },
      variantId: null, threshold: 0.7,
    });
    assert.equal(res.publishedValue, 'X');
    assert.equal(res.buckets.length, 2);
    assert.ok(res.buckets.every(b => b.qualifies));
  });

  it('pools refs across two rows with the same scalar fingerprint', () => {
    const productId = 'p-ev-1';
    const fieldKey = 'sensor_link';
    const a = seedRow(db, { productId, fieldKey, sourceId: 's-a', value: 'PAW3395', confidence: 90 });
    const b = seedRow(db, { productId, fieldKey, sourceId: 's-b', value: 'paw3395', confidence: 85 });
    seedEvidence(db, a.id, [{ url: 'https://ex/a1', confidence: 90 }]);
    seedEvidence(db, b.id, [{ url: 'https://ex/b1', confidence: 80 }]);

    const res = evaluateFieldBuckets({
      specDb: db, productId, fieldKey,
      fieldRule: scalarRule, variantId: null, threshold: 0.7,
    });
    assert.equal(res.buckets.length, 1);
    assert.equal(res.buckets[0].pooledCount, 2);
    assert.equal(res.buckets[0].qualifies, true);
    assert.equal(res.publishedValue, 'PAW3395');
    assert.deepEqual(res.publishedMemberIds.sort((x, y) => x - y), [a.id, b.id].sort((x, y) => x - y));
  });

  it('refs below threshold are excluded from the pooled count', () => {
    const productId = 'p-ev-2';
    const fieldKey = 'sensor_link';
    const a = seedRow(db, { productId, fieldKey, sourceId: 's-a', value: 'X', confidence: 90 });
    seedEvidence(db, a.id, [
      { url: 'https://ex/1', confidence: 100 },
      { url: 'https://ex/2', confidence: 80 },
      { url: 'https://ex/3', confidence: 30 },
    ]);
    const res = evaluateFieldBuckets({
      specDb: db, productId, fieldKey, fieldRule: scalarRule,
      variantId: null, threshold: 0.7,
    });
    assert.equal(res.buckets[0].pooledCount, 2);
    assert.equal(res.buckets[0].qualifies, true);
    assert.equal(res.publishedValue, 'X');
  });

  it('below-threshold bucket does not publish and membership stays empty', () => {
    const productId = 'p-ev-3';
    const fieldKey = 'sensor_link';
    const a = seedRow(db, { productId, fieldKey, sourceId: 's-a', value: 'X', confidence: 90 });
    seedEvidence(db, a.id, [
      { url: 'https://ex/1', confidence: 100 },
      { url: 'https://ex/2', confidence: 30 },
    ]);
    const res = evaluateFieldBuckets({
      specDb: db, productId, fieldKey, fieldRule: scalarRule,
      variantId: null, threshold: 0.7,
    });
    assert.equal(res.buckets[0].qualifies, false);
    assert.equal(res.publishedValue, undefined);
    assert.deepEqual(res.publishedMemberIds, []);
  });

  it('NULL evidence confidence counts as qualifying (legacy tolerance)', () => {
    const productId = 'p-ev-4';
    const fieldKey = 'sensor_link';
    const a = seedRow(db, { productId, fieldKey, sourceId: 's-a', value: 'X', confidence: 90 });
    db.db.prepare(
      `INSERT INTO field_candidate_evidence (candidate_id, url, tier, confidence, accepted)
       VALUES (?, ?, ?, NULL, 1), (?, ?, ?, NULL, 1)`
    ).run(a.id, 'https://ex/1', 'tier1', a.id, 'https://ex/2', 'tier1');

    const res = evaluateFieldBuckets({
      specDb: db, productId, fieldKey, fieldRule: scalarRule,
      variantId: null, threshold: 0.7,
    });
    assert.equal(res.buckets[0].pooledCount, 2);
    assert.equal(res.buckets[0].qualifies, true);
  });

  it('picks the bucket with the highest top_confidence when multiple qualify', () => {
    const productId = 'p-ev-5';
    const fieldKey = 'sensor_link';
    const a = seedRow(db, { productId, fieldKey, sourceId: 's-a', value: 'LOW', confidence: 60 });
    const b = seedRow(db, { productId, fieldKey, sourceId: 's-b', value: 'HIGH', confidence: 95 });
    seedEvidence(db, a.id, [
      { url: 'https://ex/a1', confidence: 100 },
      { url: 'https://ex/a2', confidence: 100 },
    ]);
    seedEvidence(db, b.id, [
      { url: 'https://ex/b1', confidence: 100 },
      { url: 'https://ex/b2', confidence: 100 },
    ]);
    const res = evaluateFieldBuckets({
      specDb: db, productId, fieldKey, fieldRule: scalarRule,
      variantId: null, threshold: 0.7,
    });
    assert.equal(res.publishedValue, 'HIGH');
  });
});

describe('evaluateFieldBuckets — list (set-equality)', () => {
  let db;
  let testDir;

  beforeEach(() => {
    try { db?.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-buckets-list-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
  });

  after(() => {
    try { db?.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('list_rules=winner_only → publishes the top qualifying list', () => {
    const productId = 'p-evl-1';
    const fieldKey = 'switches';
    const a = seedRow(db, { productId, fieldKey, sourceId: 's-a', value: ['Optical', 'Hall Effect'] });
    const b = seedRow(db, { productId, fieldKey, sourceId: 's-b', value: ['Hall Effect', 'Optical'] });
    seedEvidence(db, a.id, [{ url: 'https://ex/a1', confidence: 90 }]);
    seedEvidence(db, b.id, [{ url: 'https://ex/b1', confidence: 90 }]);

    const res = evaluateFieldBuckets({
      specDb: db, productId, fieldKey, fieldRule: listWinnerRule,
      variantId: null, threshold: 0.7,
    });
    assert.equal(res.buckets.length, 1, 'set-equal rows should pool into one bucket');
    assert.ok(Array.isArray(res.publishedValue));
    assert.deepEqual(
      [...res.publishedValue].sort(),
      ['Optical', 'Hall Effect'].sort(),
    );
  });

  it('set_union → publishes union of ONLY qualifying buckets', () => {
    const productId = 'p-evl-2';
    const fieldKey = 'switches';
    const bucketXY_a = seedRow(db, { productId, fieldKey, sourceId: 's-xy-a', value: ['x', 'y'] });
    const bucketXY_b = seedRow(db, { productId, fieldKey, sourceId: 's-xy-b', value: ['y', 'x'] });
    const bucketYZ_a = seedRow(db, { productId, fieldKey, sourceId: 's-yz-a', value: ['y', 'z'] });
    const bucketYZ_b = seedRow(db, { productId, fieldKey, sourceId: 's-yz-b', value: ['z', 'y'] });
    const bucketBX_a = seedRow(db, { productId, fieldKey, sourceId: 's-bx-a', value: ['b', 'x'] });
    const bucketBX_b = seedRow(db, { productId, fieldKey, sourceId: 's-bx-b', value: ['x', 'b'] });
    const bucketABZ = seedRow(db, { productId, fieldKey, sourceId: 's-abz', value: ['a', 'b', 'z'] });

    seedEvidence(db, bucketXY_a.id, [{ url: 'https://ex/xy-a1', confidence: 100 }]);
    seedEvidence(db, bucketXY_b.id, [{ url: 'https://ex/xy-b1', confidence: 100 }]);
    seedEvidence(db, bucketYZ_a.id, [{ url: 'https://ex/yz-a1', confidence: 100 }]);
    seedEvidence(db, bucketYZ_b.id, [{ url: 'https://ex/yz-b1', confidence: 100 }]);
    seedEvidence(db, bucketBX_a.id, [{ url: 'https://ex/bx-a1', confidence: 100 }]);
    seedEvidence(db, bucketBX_b.id, [{ url: 'https://ex/bx-b1', confidence: 100 }]);
    seedEvidence(db, bucketABZ.id, [{ url: 'https://ex/abz-1', confidence: 100 }]);

    const res = evaluateFieldBuckets({
      specDb: db, productId, fieldKey, fieldRule: listUnionRule,
      variantId: null, threshold: 0.7,
    });

    assert.ok(Array.isArray(res.publishedValue));
    const published = new Set(res.publishedValue);
    assert.ok(published.has('x'));
    assert.ok(published.has('y'));
    assert.ok(published.has('z'));
    assert.ok(published.has('b'));
    assert.ok(!published.has('a'), 'bucket {a,b,z} only has 1 ref — below min_evidence_refs=2');

    const unionMemberIds = new Set(res.publishedMemberIds);
    assert.ok(unionMemberIds.has(bucketXY_a.id));
    assert.ok(unionMemberIds.has(bucketXY_b.id));
    assert.ok(!unionMemberIds.has(bucketABZ.id), 'sub-threshold bucket members must not be resolved');
  });
});

describe('checkEvidenceGate shim (back-compat)', () => {
  let db;
  let testDir;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-gate-compat-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
  });

  after(() => {
    try { db.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('still accepts {specDb, candidateId, fieldRule} and answers for that candidate\'s bucket', () => {
    const a = seedRow(db, { productId: 'p-shim', fieldKey: 'sensor_link', sourceId: 'shim-a', value: 'X', confidence: 90 });
    seedEvidence(db, a.id, [
      { url: 'https://ex/1', confidence: 100 },
      { url: 'https://ex/2', confidence: 100 },
    ]);
    const res = checkEvidenceGate({
      specDb: db, candidateId: a.id,
      fieldRule: { evidence: { min_evidence_refs: 2 }, contract: { shape: 'scalar' } },
    });
    assert.equal(res.ok, true);
    assert.equal(res.actual, 2);
    assert.equal(res.required, 2);
  });

  it('shim returns ok: true, required: 0 when rule has no min_evidence_refs', () => {
    const res = checkEvidenceGate({
      specDb: db, candidateId: 99999,
      fieldRule: {},
    });
    assert.equal(res.ok, true);
    assert.equal(res.required, 0);
  });
});
