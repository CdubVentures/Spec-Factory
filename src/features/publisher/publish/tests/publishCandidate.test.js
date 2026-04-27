import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { publishCandidate } from '../publishCandidate.js';

const PRODUCT_ROOT = path.join('.tmp', '_test_publish_candidate');

function ensureProductJson(productId, data = {}) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  const base = {
    schema_version: 2, checkpoint_type: 'product',
    product_id: productId, category: 'mouse',
    identity: { brand: 'Test', model: 'Test' },
    sources: [], fields: {}, candidates: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...data,
  };
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify(base, null, 2));
  return base;
}

function readProductJson(productId) {
  try { return JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, productId, 'product.json'), 'utf8')); }
  catch { return null; }
}

let _seedCounter = 0;
function seedCandidate(specDb, productId, fieldKey, value, confidence, extra = {}) {
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const sourceId = extra.sourceId || `test-${productId}-${fieldKey}-${++_seedCounter}`;
  specDb.insertFieldCandidate({
    productId, fieldKey, value: serialized,
    sourceId,
    sourceType: extra.sourceType || 'test',
    unit: extra.unit ?? null,
    confidence,
    model: extra.model || '',
    validationJson: { valid: true, repairs: [], rejections: [] },
    metadataJson: extra.metadataJson ?? {},
    status: extra.status ?? 'candidate',
  });
  return specDb.getFieldCandidateBySourceId(productId, fieldKey, sourceId);
}

const fieldRule = { contract: { shape: 'scalar', type: 'number' }, parse: {}, enum: { policy: 'open' }, priority: {} };
const listFieldRule = {
  contract: { shape: 'list', type: 'string', list_rules: { dedupe: true, sort: 'none', item_union: 'set_union' } },
  parse: {}, enum: { policy: 'open' }, priority: {},
};

describe('publishCandidate', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  });

  after(() => {
    specDb.close();
    fs.rmSync(PRODUCT_ROOT, { recursive: true, force: true });
  });

  it('publishes when confidence >= threshold', () => {
    ensureProductJson('pub-ok');
    const row = seedCandidate(specDb, 'pub-ok', 'weight', 58, 92);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'pub-ok', fieldKey: 'weight',
      candidateRow: row, value: 58, unit: null, confidence: 92,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'published');
    const pj = readProductJson('pub-ok');
    assert.ok(pj.fields.weight);
    assert.equal(pj.fields.weight.confidence, 92);
    assert.equal(pj.fields.weight.source, 'pipeline');

    const resolved = specDb.getResolvedFieldCandidate('pub-ok', 'weight');
    assert.ok(resolved);
    assert.equal(resolved.status, 'resolved');
  });

  it('rejects when confidence < threshold', () => {
    ensureProductJson('pub-low');
    const row = seedCandidate(specDb, 'pub-low', 'weight', 50, 0.5);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'pub-low', fieldKey: 'weight',
      candidateRow: row, value: 50, unit: null, confidence: 0.5,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'below_threshold');
    const pj = readProductJson('pub-low');
    assert.equal(pj.fields.weight, undefined);

    // Publish result persisted in metadata
    const dbRow = specDb.getFieldCandidate('pub-low', 'weight', '50');
    assert.equal(dbRow.metadata_json.publish_result.status, 'below_threshold');
  });

  it('skips when a resolved SQL manual override locks the scalar field', () => {
    ensureProductJson('pub-lock', {
      fields: { weight: { value: 99, confidence: 1.0, source: 'pipeline', resolved_at: new Date().toISOString(), sources: [] } },
    });
    seedCandidate(specDb, 'pub-lock', 'weight', 99, 1, {
      status: 'resolved',
      sourceType: 'manual_override',
      metadataJson: { source: 'manual_override' },
    });
    const row = seedCandidate(specDb, 'pub-lock', 'weight', 58, 100);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'pub-lock', fieldKey: 'weight',
      candidateRow: row, value: 58, unit: null, confidence: 100,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'manual_override_locked');
    assert.equal(result.lockedValue, '99');
    const pj = readProductJson('pub-lock');
    assert.equal(pj.fields.weight.value, 99); // unchanged
  });

  it('does not treat a JSON-only manual override as a live scalar lock', () => {
    ensureProductJson('pub-json-only-lock', {
      fields: { weight: { value: 99, confidence: 1.0, source: 'manual_override', resolved_at: new Date().toISOString(), sources: [] } },
    });
    const row = seedCandidate(specDb, 'pub-json-only-lock', 'weight', 58, 100);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'pub-json-only-lock', fieldKey: 'weight',
      candidateRow: row, value: 58, unit: null, confidence: 100,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'published');
    const pj = readProductJson('pub-json-only-lock');
    assert.equal(pj.fields.weight.value, 58);
    assert.equal(pj.fields.weight.source, 'pipeline');
  });

  it('demotes previous resolved before publishing new', () => {
    ensureProductJson('pub-demote');
    seedCandidate(specDb, 'pub-demote', 'weight', 50, 80, { status: 'resolved' });
    const newRow = seedCandidate(specDb, 'pub-demote', 'weight', 60, 95);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'pub-demote', fieldKey: 'weight',
      candidateRow: newRow, value: 60, unit: null, confidence: 95,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'published');
    const old = specDb.getFieldCandidate('pub-demote', 'weight', '50');
    assert.equal(old.status, 'candidate'); // demoted

    const resolved = specDb.getResolvedFieldCandidate('pub-demote', 'weight');
    assert.equal(resolved.value, '60');
  });

  it('set_union publishes union of ALL qualifying buckets in the candidate pool', () => {
    ensureProductJson('pub-union');
    seedCandidate(specDb, 'pub-union', 'colors', ['black', 'white'], 100, { sourceId: 'u-bw-1' });
    seedCandidate(specDb, 'pub-union', 'colors', ['white', 'black'], 100, { sourceId: 'u-bw-2' });
    const triggerRow = seedCandidate(specDb, 'pub-union', 'colors', ['white', 'red', 'blue'], 100, { sourceId: 'u-wrb-1' });
    seedCandidate(specDb, 'pub-union', 'colors', ['red', 'blue', 'white'], 100, { sourceId: 'u-wrb-2' });

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'pub-union', fieldKey: 'colors',
      candidateRow: triggerRow, value: ['white', 'red', 'blue'], unit: null, confidence: 100,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: listFieldRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'published');
    const published = new Set(result.value);
    assert.ok(published.has('black'));
    assert.ok(published.has('white'));
    assert.ok(published.has('red'));
    assert.ok(published.has('blue'));
    const pj = readProductJson('pub-union');
    const pjPublished = new Set(pj.fields.colors.value);
    assert.equal(pjPublished.size, 4);
  });

  it('uses default threshold 0.7 when config is empty', () => {
    ensureProductJson('pub-default');
    const row = seedCandidate(specDb, 'pub-default', 'weight', 70, 0.8);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'pub-default', fieldKey: 'weight',
      candidateRow: row, value: 70, unit: null, confidence: 0.8,
      config: {},
      fieldRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'published');
  });

  // WHY: Source-centric linked_candidates shape — each entry has source_id, source_type,
  // model instead of the old sources array and source_count.
  it('linked_candidates shape: source_id, source_type, model per entry', () => {
    ensureProductJson('pub-linked');
    const row = seedCandidate(specDb, 'pub-linked', 'weight', 58, 92);

    publishCandidate({
      specDb, category: 'mouse', productId: 'pub-linked', fieldKey: 'weight',
      candidateRow: row, value: 58, unit: null, confidence: 92,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule, productRoot: PRODUCT_ROOT,
    });

    const pj = readProductJson('pub-linked');
    const linked = pj.fields.weight.linked_candidates;
    assert.ok(Array.isArray(linked));
    assert.ok(linked.length >= 1);
    const first = linked[0];
    assert.equal(typeof first.candidate_id, 'number', 'linked entry must have candidate_id');
    assert.equal(typeof first.source_id, 'string', 'linked entry must have source_id');
    assert.equal(typeof first.source_type, 'string', 'linked entry must have source_type');
    assert.equal(typeof first.model, 'string', 'linked entry must have model');
    assert.ok(first.value !== undefined, 'linked entry must have value');
    assert.equal(typeof first.confidence, 'number', 'linked entry must have confidence');
    assert.ok(['candidate', 'resolved'].includes(first.status), 'linked entry must have valid status');
    // Old fields should NOT be present
    assert.equal(first.sources, undefined, 'sources array should be removed');
    assert.equal(first.source_count, undefined, 'source_count should be removed');
  });

  // WHY: Captures set_union linked_candidates behavior — all overlapping candidates are linked.
  it('[CHAR] set_union linked_candidates includes all overlapping source rows', () => {
    ensureProductJson('pub-union-linked');
    // Seed two candidates with overlapping array items
    seedCandidate(specDb, 'pub-union-linked', 'colors', ['black', 'white'], 100);
    const row2 = seedCandidate(specDb, 'pub-union-linked', 'colors', ['white', 'red'], 90);

    publishCandidate({
      specDb, category: 'mouse', productId: 'pub-union-linked', fieldKey: 'colors',
      candidateRow: row2, value: ['white', 'red'], unit: null, confidence: 90,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: listFieldRule, productRoot: PRODUCT_ROOT,
    });

    const pj = readProductJson('pub-union-linked');
    const linked = pj.fields.colors.linked_candidates;
    // Both candidates share items with published value → both linked
    assert.ok(linked.length >= 2, `expected >=2 linked, got ${linked.length}`);
  });

  // ── Source-centric linked_candidates (Phase 4) ──────────────────────

  it('linked_candidates entries have source_id instead of sources array', () => {
    ensureProductJson('pub-src-linked');
    specDb.insertFieldCandidate({
      productId: 'pub-src-linked', fieldKey: 'weight',
      sourceId: 'cef-pub-src-linked-1', sourceType: 'cef',
      value: '58', confidence: 92, model: 'gemini',
      validationJson: {}, metadataJson: {},
    });

    const row = specDb.getFieldCandidateBySourceId('pub-src-linked', 'weight', 'cef-pub-src-linked-1');

    publishCandidate({
      specDb, category: 'mouse', productId: 'pub-src-linked', fieldKey: 'weight',
      candidateRow: row, value: 58, unit: null, confidence: 92,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule, productRoot: PRODUCT_ROOT,
    });

    const pj = readProductJson('pub-src-linked');
    const linked = pj.fields.weight.linked_candidates;
    assert.ok(Array.isArray(linked));
    assert.ok(linked.length >= 1);
    const first = linked[0];
    assert.equal(first.source_id, 'cef-pub-src-linked-1');
    assert.equal(first.source_type, 'cef');
    assert.equal(typeof first.model, 'string');
    // Should NOT have old sources array or source_count
    assert.equal(first.sources, undefined);
    assert.equal(first.source_count, undefined);
  });

  it('returns skipped when product.json does not exist', () => {
    const row = seedCandidate(specDb, 'pub-nojson', 'weight', 58, 100);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'pub-nojson', fieldKey: 'weight',
      candidateRow: row, value: 58, unit: null, confidence: 100,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'skipped');
  });

  // ── Evidence gate (min_evidence_refs) ───────────────────────────────

  it('rejects with below_evidence_refs when rule requires refs and none are projected', () => {
    ensureProductJson('pub-ev-missing');
    const row = seedCandidate(specDb, 'pub-ev-missing', 'weight', 58, 95);
    const gatedRule = { ...fieldRule, evidence: { min_evidence_refs: 1 } };

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'pub-ev-missing', fieldKey: 'weight',
      candidateRow: row, value: 58, unit: null, confidence: 95,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: gatedRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'below_evidence_refs');
    assert.equal(result.required, 1);
    assert.equal(result.actual, 0);
    const pj = readProductJson('pub-ev-missing');
    assert.equal(pj.fields.weight, undefined, 'must not publish when evidence gate fails');
    const dbRow = specDb.getFieldCandidate('pub-ev-missing', 'weight', '58');
    assert.equal(dbRow.metadata_json.publish_result.status, 'below_evidence_refs');
  });

  it('publishes when refs meet min_evidence_refs', () => {
    ensureProductJson('pub-ev-ok');
    const row = seedCandidate(specDb, 'pub-ev-ok', 'weight', 58, 95);
    specDb.replaceFieldCandidateEvidence(row.id, [
      { url: 'https://mfr.example', tier: 'tier1', confidence: 90 },
      { url: 'https://review.example', tier: 'tier2', confidence: 75 },
    ]);
    const gatedRule = { ...fieldRule, evidence: { min_evidence_refs: 2 } };

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'pub-ev-ok', fieldKey: 'weight',
      candidateRow: row, value: 58, unit: null, confidence: 95,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: gatedRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'published');
    const pj = readProductJson('pub-ev-ok');
    assert.ok(pj.fields.weight);
  });

  it('evidence gate precedes product.json write — candidate not resolved on failure', () => {
    ensureProductJson('pub-ev-guard');
    const row = seedCandidate(specDb, 'pub-ev-guard', 'weight', 58, 99);
    const gatedRule = { ...fieldRule, evidence: { min_evidence_refs: 2 } };

    publishCandidate({
      specDb, category: 'mouse', productId: 'pub-ev-guard', fieldKey: 'weight',
      candidateRow: row, value: 58, unit: null, confidence: 99,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: gatedRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(specDb.getResolvedFieldCandidate('pub-ev-guard', 'weight'), null);
  });
});
