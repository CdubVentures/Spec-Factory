import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../specDb.js';

function seedCandidate(db, sourceId = 'test-1') {
  db.insertFieldCandidate({
    productId: 'mouse-001',
    fieldKey: 'release_date',
    sourceId,
    sourceType: 'test',
    value: '2024-03-15',
    unit: null,
    confidence: 90,
    model: '',
    validationJson: {},
    metadataJson: {},
    variantId: 'v_black',
  });
  return db.getFieldCandidateBySourceId('mouse-001', 'release_date', sourceId);
}

describe('fieldCandidateEvidenceStore', () => {
  let db;
  let testDir;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fce-store-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
  });

  after(() => {
    try { db.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  beforeEach(() => {
    db.db.exec('DELETE FROM field_candidate_evidence');
    db.db.exec('DELETE FROM field_candidates');
  });

  it('insertMany + listByCandidateId roundtrip', () => {
    const candidate = seedCandidate(db);
    const refs = [
      { url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 },
      { url: 'https://review.example.com', tier: 'tier2', confidence: 80 },
      { url: 'https://amazon.example.com', tier: 'tier3', confidence: 60 },
    ];
    const inserted = db.insertFieldCandidateEvidenceMany(candidate.id, refs);
    assert.equal(inserted, 3);

    const rows = db.listFieldCandidateEvidenceByCandidateId(candidate.id);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].url, 'https://mfr.example.com');
    assert.equal(rows[0].tier, 'tier1');
    assert.equal(rows[0].confidence, 95);
  });

  it('listByTier filters across all candidates for the category', () => {
    const c1 = seedCandidate(db, 'src-a');
    const c2 = seedCandidate(db, 'src-b');
    db.insertFieldCandidateEvidenceMany(c1.id, [
      { url: 'u1', tier: 'tier1', confidence: 90 },
      { url: 'u2', tier: 'tier3', confidence: 50 },
    ]);
    db.insertFieldCandidateEvidenceMany(c2.id, [
      { url: 'u3', tier: 'tier1', confidence: 85 },
    ]);

    const tier1 = db.listFieldCandidateEvidenceByTier('tier1');
    assert.equal(tier1.length, 2);
    const tier3 = db.listFieldCandidateEvidenceByTier('tier3');
    assert.equal(tier3.length, 1);
  });

  it('cascade delete removes evidence when candidate is deleted', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'u1', tier: 'tier1', confidence: 90 },
      { url: 'u2', tier: 'tier2', confidence: 70 },
    ]);
    assert.equal(db.listFieldCandidateEvidenceByCandidateId(candidate.id).length, 2);

    db.deleteFieldCandidateBySourceId('mouse-001', 'release_date', 'test-1');
    assert.equal(db.listFieldCandidateEvidenceByCandidateId(candidate.id).length, 0);
  });

  // WHY: Lock the CASCADE behavior for every SQL path that deletes
  // field_candidates rows. Each path is a cascade rule surface:
  //   - deleteFieldCandidatesByVariantId   → variant delete (Rule 1)
  //   - deleteFieldCandidatesBySourceType  → run/source delete (Rules 2 + 4)
  //   - deleteFieldCandidatesByProductAndField → bulk field candidate delete (Rule 5)
  // All must propagate to field_candidate_evidence via FK CASCADE.
  it('cascade delete fires when deleting by variant_id', () => {
    const c1 = seedCandidate(db, 'v-1');
    const c2 = seedCandidate(db, 'v-2');
    db.insertFieldCandidateEvidenceMany(c1.id, [{ url: 'a', tier: 'tier1', confidence: 90 }]);
    db.insertFieldCandidateEvidenceMany(c2.id, [{ url: 'b', tier: 'tier1', confidence: 80 }]);

    db.deleteFieldCandidatesByVariantId('mouse-001', 'v_black');
    assert.equal(db.listFieldCandidateEvidenceByCandidateId(c1.id).length, 0);
    assert.equal(db.listFieldCandidateEvidenceByCandidateId(c2.id).length, 0);
  });

  it('cascade delete fires when deleting by source_type (run-delete strip)', () => {
    const c = seedCandidate(db, 'src-type-1');
    db.insertFieldCandidateEvidenceMany(c.id, [
      { url: 'a', tier: 'tier1', confidence: 90 },
      { url: 'b', tier: 'tier2', confidence: 70 },
    ]);

    db.deleteFieldCandidatesBySourceType('mouse-001', 'release_date', 'test');
    assert.equal(db.listFieldCandidateEvidenceByCandidateId(c.id).length, 0);
  });

  it('cascade delete fires when deleting by product + field (deleteAllCandidatesForField)', () => {
    const c = seedCandidate(db, 'bulk-1');
    db.insertFieldCandidateEvidenceMany(c.id, [{ url: 'x', tier: 'tier1', confidence: 85 }]);

    db.deleteFieldCandidatesByProductAndField('mouse-001', 'release_date');
    assert.equal(db.listFieldCandidateEvidenceByCandidateId(c.id).length, 0);
  });

  it('deleteByCandidateId removes all evidence for one candidate', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'u1', tier: 'tier1', confidence: 90 },
      { url: 'u2', tier: 'tier2', confidence: 70 },
    ]);
    db.deleteFieldCandidateEvidenceByCandidateId(candidate.id);
    assert.equal(db.listFieldCandidateEvidenceByCandidateId(candidate.id).length, 0);
  });

  it('replaceFieldCandidateEvidence clears then inserts atomically', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'old1', tier: 'tier3', confidence: 50 },
      { url: 'old2', tier: 'tier3', confidence: 40 },
    ]);
    const inserted = db.replaceFieldCandidateEvidence(candidate.id, [
      { url: 'new1', tier: 'tier1', confidence: 95 },
    ]);
    assert.equal(inserted, 1);
    const rows = db.listFieldCandidateEvidenceByCandidateId(candidate.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].url, 'new1');
    assert.equal(rows[0].tier, 'tier1');
  });

  it('insertMany skips entries with missing url', () => {
    const candidate = seedCandidate(db);
    const inserted = db.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'valid', tier: 'tier1', confidence: 90 },
      { tier: 'tier2', confidence: 70 },
      { url: '', tier: 'tier3', confidence: 50 },
      null,
      'not-an-object',
    ]);
    assert.equal(inserted, 1);
  });

  it('confidence may be null (not required)', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidence({
      candidateId: candidate.id,
      url: 'u',
      tier: 'tier1',
      confidence: undefined,
    });
    const rows = db.listFieldCandidateEvidenceByCandidateId(candidate.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].confidence, null);
  });

  // ── URL verification projection (http_status / verified_at / accepted) ──

  it('insert stores http_status, verified_at, accepted when provided', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidence({
      candidateId: candidate.id,
      url: 'https://verified.example.com',
      tier: 'tier1',
      confidence: 95,
      http_status: 200,
      verified_at: '2026-04-18T22:30:00.000Z',
      accepted: 1,
    });
    const rows = db.listFieldCandidateEvidenceByCandidateId(candidate.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].http_status, 200);
    assert.equal(rows[0].verified_at, '2026-04-18T22:30:00.000Z');
    assert.equal(rows[0].accepted, 1);
  });

  it('insert defaults: http_status=NULL, verified_at=NULL, accepted=1 when omitted', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidence({
      candidateId: candidate.id,
      url: 'https://legacy.example.com',
      tier: 'tier1',
      confidence: 90,
    });
    const rows = db.listFieldCandidateEvidenceByCandidateId(candidate.id);
    assert.equal(rows[0].http_status, null);
    assert.equal(rows[0].verified_at, null);
    assert.equal(rows[0].accepted, 1);
  });

  it('insertMany preserves http_status / verified_at / accepted per ref', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'https://good.example.com', tier: 'tier1', confidence: 95, http_status: 200, verified_at: '2026-04-18T22:30:00.000Z', accepted: 1 },
      { url: 'https://bad.example.com', tier: 'tier2', confidence: 80, http_status: 404, verified_at: '2026-04-18T22:30:01.000Z', accepted: 0 },
    ]);
    const rows = db.listFieldCandidateEvidenceByCandidateId(candidate.id);
    assert.equal(rows.length, 2);
    const good = rows.find(r => r.url === 'https://good.example.com');
    const bad = rows.find(r => r.url === 'https://bad.example.com');
    assert.equal(good.http_status, 200);
    assert.equal(good.accepted, 1);
    assert.equal(bad.http_status, 404);
    assert.equal(bad.accepted, 0);
  });

  it('countSplitByCandidateId returns { accepted, rejected } counts', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'a', tier: 'tier1', confidence: 95, http_status: 200, accepted: 1 },
      { url: 'b', tier: 'tier2', confidence: 80, http_status: 200, accepted: 1 },
      { url: 'c', tier: 'tier1', confidence: 70, http_status: 404, accepted: 0 },
    ]);
    const split = db.countFieldCandidateEvidenceSplitByCandidateId(candidate.id);
    assert.equal(split.accepted, 2);
    assert.equal(split.rejected, 1);
  });

  it('countSplitByCandidateId returns zeros for candidate with no evidence', () => {
    const candidate = seedCandidate(db);
    const split = db.countFieldCandidateEvidenceSplitByCandidateId(candidate.id);
    assert.equal(split.accepted, 0);
    assert.equal(split.rejected, 0);
  });

  it('countSplitByCandidateId treats legacy NULL http_status + accepted=1 as accepted', () => {
    // Legacy rows (pre-verification feature) have http_status NULL and accepted DEFAULT 1.
    // They must count as "accepted" so historical data stays visible.
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'legacy-1', tier: 'tier1', confidence: 95 },  // no http_status
      { url: 'legacy-2', tier: 'tier2', confidence: 80 },  // no http_status
    ]);
    const split = db.countFieldCandidateEvidenceSplitByCandidateId(candidate.id);
    assert.equal(split.accepted, 2);
    assert.equal(split.rejected, 0);
  });

  // ── Evidence upgrade: evidence_kind + supporting_evidence columns ─────

  it('persists evidence_kind + supporting_evidence when provided', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidenceMany(candidate.id, [
      {
        url: 'https://corsair.com/explorer/m75',
        tier: 'tier1',
        confidence: 93,
        evidence_kind: 'direct_quote',
        supporting_evidence: 'As of 04/19/2024, You can now get the M75 AIR in your choice of Black, Grey, or White!',
      },
      {
        url: 'https://corsair.com/p/white-sku',
        tier: 'tier1',
        confidence: 60,
        evidence_kind: 'identity_only',
        supporting_evidence: '',
      },
    ]);
    const rows = db.listFieldCandidateEvidenceByCandidateId(candidate.id);
    const direct = rows.find(r => r.evidence_kind === 'direct_quote');
    const ident = rows.find(r => r.evidence_kind === 'identity_only');
    assert.ok(direct.supporting_evidence.startsWith('As of 04/19/2024'));
    assert.equal(ident.supporting_evidence, '');
  });

  it('legacy ref without evidence_kind / supporting_evidence stores NULL', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'https://legacy.example.com', tier: 'tier1', confidence: 90 },
    ]);
    const rows = db.listFieldCandidateEvidenceByCandidateId(candidate.id);
    assert.equal(rows[0].evidence_kind, null);
    assert.equal(rows[0].supporting_evidence, null);
  });

  it('countSubstantiveByCandidateId excludes identity_only refs', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'https://a.example.com', tier: 'tier1', confidence: 93, evidence_kind: 'direct_quote', supporting_evidence: 'quote a' },
      { url: 'https://b.example.com', tier: 'tier1', confidence: 90, evidence_kind: 'byline_timestamp', supporting_evidence: 'byline b' },
      { url: 'https://c.example.com', tier: 'tier1', confidence: 60, evidence_kind: 'identity_only', supporting_evidence: '' },
    ]);
    assert.equal(db.countFieldCandidateEvidenceByCandidateId(candidate.id), 3);
    assert.equal(db.countFieldCandidateSubstantiveEvidenceByCandidateId(candidate.id), 2);
  });

  it('countSubstantiveByCandidateId returns 0 when every ref is identity_only', () => {
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'https://a.example.com', tier: 'tier1', confidence: 60, evidence_kind: 'identity_only', supporting_evidence: '' },
      { url: 'https://b.example.com', tier: 'tier1', confidence: 55, evidence_kind: 'identity_only', supporting_evidence: '' },
    ]);
    assert.equal(db.countFieldCandidateSubstantiveEvidenceByCandidateId(candidate.id), 0);
  });

  it('countSubstantiveByCandidateId treats legacy NULL evidence_kind as substantive', () => {
    // WHY: pre-upgrade rebuilt rows have NULL evidence_kind. The gate must
    // keep counting them or we retroactively invalidate historical data.
    const candidate = seedCandidate(db);
    db.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'https://legacy.example.com', tier: 'tier1', confidence: 95 },  // no evidence_kind
    ]);
    assert.equal(db.countFieldCandidateSubstantiveEvidenceByCandidateId(candidate.id), 1);
  });
});
