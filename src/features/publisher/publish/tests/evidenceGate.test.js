import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { checkEvidenceGate, readMinEvidenceRefs } from '../evidenceGate.js';

describe('readMinEvidenceRefs', () => {
  it('returns 0 when rule has no evidence block', () => {
    assert.equal(readMinEvidenceRefs({}), 0);
    assert.equal(readMinEvidenceRefs(null), 0);
    assert.equal(readMinEvidenceRefs(undefined), 0);
  });

  it('returns 0 when min_evidence_refs is missing/invalid', () => {
    assert.equal(readMinEvidenceRefs({ evidence: {} }), 0);
    assert.equal(readMinEvidenceRefs({ evidence: { min_evidence_refs: 'two' } }), 0);
    assert.equal(readMinEvidenceRefs({ evidence: { min_evidence_refs: null } }), 0);
  });

  it('floors fractional values and clamps negatives to 0', () => {
    assert.equal(readMinEvidenceRefs({ evidence: { min_evidence_refs: 2.9 } }), 2);
    assert.equal(readMinEvidenceRefs({ evidence: { min_evidence_refs: -1 } }), 0);
  });

  it('returns the integer for a valid positive value', () => {
    assert.equal(readMinEvidenceRefs({ evidence: { min_evidence_refs: 1 } }), 1);
    assert.equal(readMinEvidenceRefs({ evidence: { min_evidence_refs: 3 } }), 3);
  });
});

describe('checkEvidenceGate', () => {
  let db;
  let testDir;
  let candidateId;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-gate-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
    db.insertFieldCandidate({
      productId: 'p1', fieldKey: 'release_date',
      sourceId: 'src-gate-1', sourceType: 'test',
      value: '2024-01-01', unit: null, confidence: 90,
      model: '', validationJson: {}, metadataJson: {},
    });
    candidateId = db.getFieldCandidateBySourceId('p1', 'release_date', 'src-gate-1').id;
  });

  after(() => {
    try { db.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('passes when min_evidence_refs is 0 and no projection exists', () => {
    const res = checkEvidenceGate({
      specDb: db,
      candidateId,
      fieldRule: { evidence: { min_evidence_refs: 0 } },
    });
    assert.equal(res.ok, true);
  });

  it('passes when rule has no evidence block', () => {
    const res = checkEvidenceGate({ specDb: db, candidateId, fieldRule: {} });
    assert.equal(res.ok, true);
  });

  it('fails when min_evidence_refs > 0 and no projected refs', () => {
    const res = checkEvidenceGate({
      specDb: db,
      candidateId,
      fieldRule: { evidence: { min_evidence_refs: 1 } },
    });
    assert.equal(res.ok, false);
    assert.equal(res.required, 1);
    assert.equal(res.actual, 0);
  });

  it('passes when projected refs meet the minimum', () => {
    db.replaceFieldCandidateEvidence(candidateId, [
      { url: 'https://a.example', tier: 'tier1', confidence: 90 },
      { url: 'https://b.example', tier: 'tier2', confidence: 70 },
    ]);
    const res = checkEvidenceGate({
      specDb: db,
      candidateId,
      fieldRule: { evidence: { min_evidence_refs: 2 } },
    });
    assert.equal(res.ok, true);
    assert.equal(res.required, 2);
    assert.equal(res.actual, 2);
  });

  it('counts distinct urls (duplicates do not inflate the count)', () => {
    db.replaceFieldCandidateEvidence(candidateId, [
      { url: 'https://dup.example', tier: 'tier1', confidence: 90 },
      { url: 'https://dup.example', tier: 'tier2', confidence: 70 },
    ]);
    const res = checkEvidenceGate({
      specDb: db,
      candidateId,
      fieldRule: { evidence: { min_evidence_refs: 2 } },
    });
    assert.equal(res.ok, false, 'duplicate urls should only count once');
    assert.equal(res.actual, 1);
  });

  it('fails when specDb has no count helper (defensive)', () => {
    const stubSpecDb = {};
    const res = checkEvidenceGate({
      specDb: stubSpecDb,
      candidateId: 1,
      fieldRule: { evidence: { min_evidence_refs: 1 } },
    });
    assert.equal(res.ok, false);
    assert.equal(res.actual, 0);
  });
});

describe('checkEvidenceGate — evidence-upgrade substantive count', () => {
  let db;
  let testDir;
  let candidateId;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-gate-subst-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
    db.insertFieldCandidate({
      productId: 'p-subst', fieldKey: 'release_date',
      sourceId: 'src-subst-1', sourceType: 'test',
      value: '2024-04-19', unit: null, confidence: 93,
      model: '', validationJson: {}, metadataJson: {},
    });
    candidateId = db.getFieldCandidateBySourceId('p-subst', 'release_date', 'src-subst-1').id;
  });

  after(() => {
    try { db.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('mixed identity_only + direct_quote passes min=1 (substantive count = 1)', () => {
    db.replaceFieldCandidateEvidence(candidateId, [
      { url: 'https://corsair.com/p/white-sku', tier: 'tier1', confidence: 60, evidence_kind: 'identity_only', supporting_evidence: '' },
      { url: 'https://corsair.com/explorer/m75', tier: 'tier1', confidence: 93, evidence_kind: 'direct_quote', supporting_evidence: 'As of 04/19/2024...' },
    ]);
    const res = checkEvidenceGate({
      specDb: db, candidateId,
      fieldRule: { evidence: { min_evidence_refs: 1 } },
    });
    assert.equal(res.ok, true, 'substantive count should be 1');
    assert.equal(res.actual, 1);
  });

  it('all-identity_only fails min=1 (no substantive refs)', () => {
    db.replaceFieldCandidateEvidence(candidateId, [
      { url: 'https://corsair.com/a', tier: 'tier1', confidence: 60, evidence_kind: 'identity_only', supporting_evidence: '' },
      { url: 'https://corsair.com/b', tier: 'tier1', confidence: 55, evidence_kind: 'identity_only', supporting_evidence: '' },
    ]);
    const res = checkEvidenceGate({
      specDb: db, candidateId,
      fieldRule: { evidence: { min_evidence_refs: 1 } },
    });
    assert.equal(res.ok, false, 'all-identity_only must fail the gate');
    assert.equal(res.actual, 0);
  });

  it('legacy NULL-kind ref counts as substantive (pre-upgrade tolerance)', () => {
    // WHY: pre-upgrade rebuilt rows have NULL evidence_kind. The gate must
    // keep counting them — we don't retroactively invalidate legacy data.
    db.replaceFieldCandidateEvidence(candidateId, [
      { url: 'https://legacy.example.com', tier: 'tier1', confidence: 90 }, // no evidence_kind
    ]);
    const res = checkEvidenceGate({
      specDb: db, candidateId,
      fieldRule: { evidence: { min_evidence_refs: 1 } },
    });
    assert.equal(res.ok, true);
    assert.equal(res.actual, 1);
  });

  it('mix of legacy NULL + identity_only + direct_quote counts 2 substantive', () => {
    db.replaceFieldCandidateEvidence(candidateId, [
      { url: 'https://legacy.example.com', tier: 'tier1', confidence: 90 }, // legacy — substantive
      { url: 'https://corsair.com/p/sku', tier: 'tier1', confidence: 60, evidence_kind: 'identity_only', supporting_evidence: '' },
      { url: 'https://corsair.com/explorer', tier: 'tier1', confidence: 93, evidence_kind: 'direct_quote', supporting_evidence: 'x' },
    ]);
    const res = checkEvidenceGate({
      specDb: db, candidateId,
      fieldRule: { evidence: { min_evidence_refs: 2 } },
    });
    assert.equal(res.ok, true);
    assert.equal(res.actual, 2);
  });
});
