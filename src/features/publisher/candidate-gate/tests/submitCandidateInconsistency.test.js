import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { submitCandidate } from '../submitCandidate.js';

const PRODUCT_ROOT = path.join('.tmp', '_test_submit_inconsistency');

function fieldRulesWithMinRefs(n) {
  return {
    sensor_link: {
      contract: { shape: 'scalar', type: 'string' },
      parse: {}, enum: { policy: 'open' }, priority: {},
      evidence: { min_evidence_refs: n },
    },
  };
}

function ensureProductJson(productId) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({
    schema_version: 2, checkpoint_type: 'product',
    product_id: productId, category: 'mouse',
    identity: { brand: 'Test', model: 'Test' },
    sources: [], fields: {}, candidates: {},
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, null, 2));
}

function readProductJson(productId) {
  try { return JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, productId, 'product.json'), 'utf8')); }
  catch { return null; }
}

describe('submitCandidate — Gate 1 inconsistency probe', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  });

  after(() => {
    specDb.close();
    fs.rmSync(PRODUCT_ROOT, { recursive: true, force: true });
  });

  it('hard-rejects when LLM conf < threshold AND bucket evidence >= min_evidence_refs', async () => {
    ensureProductJson('p-inc-1');
    const res = await submitCandidate({
      category: 'mouse', productId: 'p-inc-1', fieldKey: 'sensor_link',
      value: 'PAW3395', confidence: 50,
      sourceMeta: { source: 'key_finder', run_number: 1, model: 'test' },
      fieldRules: fieldRulesWithMinRefs(2),
      knownValues: null, componentDb: null, specDb,
      productRoot: PRODUCT_ROOT,
      config: { publishConfidenceThreshold: 0.7, evidenceVerificationEnabled: false },
      metadata: {
        evidence_refs: [
          { url: 'https://ex/1', tier: 'tier1', confidence: 100 },
          { url: 'https://ex/2', tier: 'tier1', confidence: 100 },
        ],
      },
    });

    assert.equal(res.status, 'rejected_inconsistent');
    assert.equal(res.candidateId, null);
    assert.equal(res.pooledEvidence, 2);
    assert.equal(res.requiredEvidence, 2);

    const pj = readProductJson('p-inc-1');
    assert.ok(!pj.candidates?.sensor_link?.length, 'no audit trail in product.json for inconsistent submission');

    const row = specDb.db.prepare(
      "SELECT * FROM field_candidates WHERE product_id = 'p-inc-1' AND field_key = 'sensor_link'"
    ).get();
    assert.equal(row, undefined, 'candidate row must be purged');
  });

  it('does NOT reject when LLM conf < threshold but bucket evidence is insufficient', async () => {
    ensureProductJson('p-inc-2');
    const res = await submitCandidate({
      category: 'mouse', productId: 'p-inc-2', fieldKey: 'sensor_link',
      value: 'HERO', confidence: 50,
      sourceMeta: { source: 'key_finder', run_number: 1, model: 'test' },
      fieldRules: fieldRulesWithMinRefs(3),
      knownValues: null, componentDb: null, specDb,
      productRoot: PRODUCT_ROOT,
      config: { publishConfidenceThreshold: 0.7, evidenceVerificationEnabled: false },
      metadata: {
        evidence_refs: [
          { url: 'https://ex/h1', tier: 'tier1', confidence: 100 },
          { url: 'https://ex/h2', tier: 'tier1', confidence: 30 },
        ],
      },
    });

    assert.equal(res.status, 'accepted', 'standard below-threshold path, not inconsistency');
    const pj = readProductJson('p-inc-2');
    assert.equal(pj.candidates?.sensor_link?.length, 1, 'submission preserved for audit');
  });

  it('does NOT reject when LLM conf >= threshold regardless of evidence', async () => {
    ensureProductJson('p-inc-3');
    const res = await submitCandidate({
      category: 'mouse', productId: 'p-inc-3', fieldKey: 'sensor_link',
      value: 'OPTICAL', confidence: 90,
      sourceMeta: { source: 'key_finder', run_number: 1, model: 'test' },
      fieldRules: fieldRulesWithMinRefs(2),
      knownValues: null, componentDb: null, specDb,
      productRoot: PRODUCT_ROOT,
      config: { publishConfidenceThreshold: 0.7, evidenceVerificationEnabled: false },
      metadata: {
        evidence_refs: [
          { url: 'https://ex/o1', tier: 'tier1', confidence: 100 },
          { url: 'https://ex/o2', tier: 'tier1', confidence: 100 },
        ],
      },
    });

    assert.equal(res.status, 'accepted');
  });

  it('does NOT trigger on fields without min_evidence_refs rule', async () => {
    ensureProductJson('p-inc-4');
    const res = await submitCandidate({
      category: 'mouse', productId: 'p-inc-4', fieldKey: 'sensor_link',
      value: 'WEIRD', confidence: 30,
      sourceMeta: { source: 'key_finder', run_number: 1, model: 'test' },
      fieldRules: {
        sensor_link: {
          contract: { shape: 'scalar', type: 'string' },
          parse: {}, enum: { policy: 'open' }, priority: {},
          // no evidence block
        },
      },
      knownValues: null, componentDb: null, specDb,
      productRoot: PRODUCT_ROOT,
      config: { publishConfidenceThreshold: 0.7, evidenceVerificationEnabled: false },
      metadata: {
        evidence_refs: [
          { url: 'https://ex/w1', tier: 'tier1', confidence: 100 },
        ],
      },
    });

    assert.equal(res.status, 'accepted');
  });

  it('cascades evidence when purging the inconsistent row', async () => {
    ensureProductJson('p-inc-5');
    await submitCandidate({
      category: 'mouse', productId: 'p-inc-5', fieldKey: 'sensor_link',
      value: 'STRANGE', confidence: 45,
      sourceMeta: { source: 'key_finder', run_number: 1, model: 'test' },
      fieldRules: fieldRulesWithMinRefs(2),
      knownValues: null, componentDb: null, specDb,
      productRoot: PRODUCT_ROOT,
      config: { publishConfidenceThreshold: 0.7, evidenceVerificationEnabled: false },
      metadata: {
        evidence_refs: [
          { url: 'https://ex/s1', tier: 'tier1', confidence: 100 },
          { url: 'https://ex/s2', tier: 'tier1', confidence: 100 },
        ],
      },
    });

    const evidenceRows = specDb.db.prepare(
      `SELECT COUNT(*) AS n FROM field_candidate_evidence fce
       LEFT JOIN field_candidates fc ON fc.id = fce.candidate_id
       WHERE fc.id IS NULL`
    ).get();
    assert.equal(evidenceRows.n, 0, 'no orphan evidence rows should remain');
  });
});
