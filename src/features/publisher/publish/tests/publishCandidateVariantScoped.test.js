import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { publishCandidate } from '../publishCandidate.js';

const PRODUCT_ROOT = path.join('.tmp', '_test_publish_variant_scoped');

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
function seedCandidate(specDb, productId, fieldKey, value, confidence, variantId = null, extra = {}) {
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const sourceId = extra.sourceId || `rdf-${productId}-${++_seedCounter}`;
  specDb.insertFieldCandidate({
    productId, fieldKey, value: serialized,
    sourceId,
    sourceType: extra.sourceType || 'release_date_finder',
    unit: null,
    confidence,
    model: extra.model || 'test-model',
    validationJson: { valid: true, repairs: [], rejections: [] },
    metadataJson: extra.metadataJson ?? {},
    status: extra.status ?? 'candidate',
    variantId,
  });
  return specDb.getFieldCandidateBySourceId(productId, fieldKey, sourceId);
}

const scalarDateRule = { contract: { shape: 'scalar', type: 'date' }, parse: {}, enum: { policy: 'open' }, priority: {} };

describe('publishCandidate — variant-scoped (branch 3)', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  });

  after(() => {
    specDb.close();
    fs.rmSync(PRODUCT_ROOT, { recursive: true, force: true });
  });

  it('writes to variant_fields[vid][fieldKey] when variant_id is set; leaves scalar fields untouched', () => {
    ensureProductJson('vs-a');
    const vidA = 'v_aaaaaaaa';
    const row = seedCandidate(specDb, 'vs-a', 'release_date', '2024-03-15', 90, vidA);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'vs-a', fieldKey: 'release_date',
      candidateRow: row, value: '2024-03-15', unit: null, confidence: 90,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: scalarDateRule, productRoot: PRODUCT_ROOT,
      variantId: vidA,
    });

    assert.equal(result.status, 'published');
    assert.equal(result.variantId, vidA);
    const pj = readProductJson('vs-a');
    assert.ok(pj.variant_fields, 'variant_fields exists');
    assert.ok(pj.variant_fields[vidA], 'vidA entry exists');
    assert.equal(pj.variant_fields[vidA].release_date.value, '2024-03-15');
    assert.equal(pj.variant_fields[vidA].release_date.confidence, 90);
    assert.equal(pj.variant_fields[vidA].release_date.source, 'pipeline');
    assert.deepEqual(pj.fields, {}, 'scalar fields untouched');
  });

  it('two variants both publish → both entries coexist, scalar fields empty', () => {
    ensureProductJson('vs-b');
    const vA = 'v_aaaaaaaa';
    const vB = 'v_bbbbbbbb';
    const rowA = seedCandidate(specDb, 'vs-b', 'release_date', '2024-01-01', 88, vA);
    const rowB = seedCandidate(specDb, 'vs-b', 'release_date', '2024-08-20', 85, vB);

    publishCandidate({
      specDb, category: 'mouse', productId: 'vs-b', fieldKey: 'release_date',
      candidateRow: rowA, value: '2024-01-01', unit: null, confidence: 88,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: scalarDateRule, productRoot: PRODUCT_ROOT,
      variantId: vA,
    });
    publishCandidate({
      specDb, category: 'mouse', productId: 'vs-b', fieldKey: 'release_date',
      candidateRow: rowB, value: '2024-08-20', unit: null, confidence: 85,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: scalarDateRule, productRoot: PRODUCT_ROOT,
      variantId: vB,
    });

    const pj = readProductJson('vs-b');
    assert.equal(pj.variant_fields[vA].release_date.value, '2024-01-01');
    assert.equal(pj.variant_fields[vB].release_date.value, '2024-08-20');
    assert.deepEqual(pj.fields, {}, 'scalar fields remain empty');
  });

  it('mark resolved is scoped to variant — does not flip other variants resolved status', () => {
    ensureProductJson('vs-c');
    const vA = 'v_cccc1111';
    const vB = 'v_cccc2222';
    const rowA = seedCandidate(specDb, 'vs-c', 'release_date', '2024-05-01', 90, vA);
    seedCandidate(specDb, 'vs-c', 'release_date', '2024-05-02', 90, vB);

    publishCandidate({
      specDb, category: 'mouse', productId: 'vs-c', fieldKey: 'release_date',
      candidateRow: rowA, value: '2024-05-01', unit: null, confidence: 90,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: scalarDateRule, productRoot: PRODUCT_ROOT,
      variantId: vA,
    });

    const allRows = specDb.getFieldCandidatesByProductAndField('vs-c', 'release_date');
    const rowAResolved = allRows.find(r => r.variant_id === vA);
    const rowBResolved = allRows.find(r => r.variant_id === vB);
    assert.equal(rowAResolved.status, 'resolved', 'vA is resolved');
    assert.equal(rowBResolved.status, 'candidate', 'vB is NOT auto-resolved');
  });

  it('below_threshold → no JSON write, no variant_fields entry', () => {
    ensureProductJson('vs-d');
    const vid = 'v_ddddeeee';
    const row = seedCandidate(specDb, 'vs-d', 'release_date', '2024-07-04', 50, vid);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'vs-d', fieldKey: 'release_date',
      candidateRow: row, value: '2024-07-04', unit: null, confidence: 50,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: scalarDateRule, productRoot: PRODUCT_ROOT,
      variantId: vid,
    });

    assert.equal(result.status, 'below_threshold');
    const pj = readProductJson('vs-d');
    assert.ok(!pj.variant_fields?.[vid]?.release_date, 'no variant_fields entry');
  });

  it('manual_override_locked is read from SQL and respected per variant', () => {
    const vid = 'v_ffff9999';
    ensureProductJson('vs-e');
    seedCandidate(specDb, 'vs-e', 'release_date', '2020-01-01', 1, vid, {
      sourceId: 'manual-vs-e-v-black',
      sourceType: 'manual_override',
      metadataJson: { source: 'manual_override' },
      status: 'resolved',
    });
    const pj = readProductJson('vs-e');
    pj.variant_fields = {
      [vid]: { release_date: { value: '2020-01-01', source: 'pipeline', confidence: 100 } },
    };
    fs.writeFileSync(path.join(PRODUCT_ROOT, 'vs-e', 'product.json'), JSON.stringify(pj, null, 2));
    const row = seedCandidate(specDb, 'vs-e', 'release_date', '2024-09-09', 95, vid);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'vs-e', fieldKey: 'release_date',
      candidateRow: row, value: '2024-09-09', unit: null, confidence: 95,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: scalarDateRule, productRoot: PRODUCT_ROOT,
      variantId: vid,
    });

    assert.equal(result.status, 'manual_override_locked');
    assert.equal(result.lockedValue, '2020-01-01');
    const after = readProductJson('vs-e');
    assert.equal(after.variant_fields[vid].release_date.value, '2020-01-01', 'manual value preserved');
  });

  it('JSON-only variant manual override does not lock publishing', () => {
    const vid = 'v_jsononly9999';
    ensureProductJson('vs-json-only-lock', {
      variant_fields: {
        [vid]: { release_date: { value: '2020-01-01', source: 'manual_override', confidence: 100 } },
      },
    });
    const row = seedCandidate(specDb, 'vs-json-only-lock', 'release_date', '2024-09-09', 95, vid);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'vs-json-only-lock', fieldKey: 'release_date',
      candidateRow: row, value: '2024-09-09', unit: null, confidence: 95,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: scalarDateRule, productRoot: PRODUCT_ROOT,
      variantId: vid,
    });

    assert.equal(result.status, 'published');
    const pj = readProductJson('vs-json-only-lock');
    assert.equal(pj.variant_fields[vid].release_date.value, '2024-09-09');
    assert.equal(pj.variant_fields[vid].release_date.source, 'pipeline');
  });

  it('resolves variantId from candidateRow when not explicitly passed', () => {
    ensureProductJson('vs-f');
    const vid = 'v_ff00ff00';
    const row = seedCandidate(specDb, 'vs-f', 'release_date', '2025-02-20', 80, vid);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'vs-f', fieldKey: 'release_date',
      candidateRow: row, value: '2025-02-20', unit: null, confidence: 80,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: scalarDateRule, productRoot: PRODUCT_ROOT,
      // variantId NOT passed — publisher reads from candidateRow.variant_id
    });

    assert.equal(result.status, 'published');
    const pj = readProductJson('vs-f');
    assert.equal(pj.variant_fields[vid].release_date.value, '2025-02-20');
  });

  it('normal scalar path unchanged when no variant_id', () => {
    ensureProductJson('vs-g');
    const row = seedCandidate(specDb, 'vs-g', 'release_date', '2019-06-06', 90, null);

    const result = publishCandidate({
      specDb, category: 'mouse', productId: 'vs-g', fieldKey: 'release_date',
      candidateRow: row, value: '2019-06-06', unit: null, confidence: 90,
      config: { publishConfidenceThreshold: 0.7 },
      fieldRule: scalarDateRule, productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'published');
    const pj = readProductJson('vs-g');
    assert.equal(pj.fields.release_date.value, '2019-06-06', 'scalar published');
    assert.ok(!pj.variant_fields, 'no variant_fields key created');
  });
});
