import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { publishManualOverride } from '../publishManualOverride.js';

const PRODUCT_ROOT = path.join('.tmp', '_test_publish_manual_override');

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
}

function readProductJson(productId) {
  try { return JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, productId, 'product.json'), 'utf8')); }
  catch { return null; }
}

describe('publishManualOverride', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  });

  after(() => {
    specDb.close();
    fs.rmSync(PRODUCT_ROOT, { recursive: true, force: true });
  });

  it('creates resolved candidate with manual_override source', () => {
    ensureProductJson('mo-basic');

    const result = publishManualOverride({
      specDb, category: 'mouse', productId: 'mo-basic', fieldKey: 'weight',
      value: 62, reviewer: 'alice', reason: 'verified on scale',
      productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'published');
    assert.equal(result.source, 'manual_override');

    // SQL: candidate row exists with resolved status
    const row = specDb.getFieldCandidate('mo-basic', 'weight', '62');
    assert.ok(row);
    assert.equal(row.status, 'resolved');
    assert.equal(row.confidence, 1.0);
    assert.equal(row.metadata_json.source, 'manual_override');
    assert.equal(row.metadata_json.reviewer, 'alice');
    assert.equal(row.metadata_json.reason, 'verified on scale');
  });

  it('writes to product.json fields with manual_override source', () => {
    ensureProductJson('mo-json');

    publishManualOverride({
      specDb, category: 'mouse', productId: 'mo-json', fieldKey: 'sensor',
      value: 'PAW3950', reviewer: 'bob',
      productRoot: PRODUCT_ROOT,
    });

    const pj = readProductJson('mo-json');
    assert.ok(pj.fields.sensor);
    assert.equal(pj.fields.sensor.value, 'PAW3950');
    assert.equal(pj.fields.sensor.confidence, 1.0);
    assert.equal(pj.fields.sensor.source, 'manual_override');
  });

  it('publishes variant-scoped overrides to SQL and product.json.variant_fields', () => {
    ensureProductJson('mo-variant');

    const result = publishManualOverride({
      specDb, category: 'mouse', productId: 'mo-variant', fieldKey: 'release_date',
      value: '2026-01-15', variantId: 'v_black', reviewer: 'alice',
      productRoot: PRODUCT_ROOT,
    });

    assert.equal(result.status, 'published');
    assert.equal(result.variantId, 'v_black');

    const rows = specDb.getFieldCandidatesByProductAndField('mo-variant', 'release_date', 'v_black');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'resolved');
    assert.equal(rows[0].source_type, 'manual_override');
    assert.equal(rows[0].variant_id, 'v_black');
    assert.equal(rows[0].metadata_json.source, 'manual_override');

    const pj = readProductJson('mo-variant');
    assert.equal(pj.variant_fields.v_black.release_date.value, '2026-01-15');
    assert.equal(pj.variant_fields.v_black.release_date.source, 'manual_override');
    assert.equal(pj.fields.release_date, undefined);
  });

  it('demotes previously resolved candidate', () => {
    ensureProductJson('mo-demote');
    // Seed an existing resolved candidate
    specDb.upsertFieldCandidate({
      productId: 'mo-demote', fieldKey: 'weight', value: '55',
      confidence: 90, sourceCount: 1,
      sourcesJson: [{ source: 'pipeline' }],
      validationJson: { valid: true, repairs: [], rejections: [] },
      metadataJson: {}, status: 'resolved',
    });

    publishManualOverride({
      specDb, category: 'mouse', productId: 'mo-demote', fieldKey: 'weight',
      value: 60, productRoot: PRODUCT_ROOT,
    });

    // Old resolved should be demoted
    const old = specDb.getFieldCandidate('mo-demote', 'weight', '55');
    assert.equal(old.status, 'candidate');

    // New override is resolved
    const override = specDb.getResolvedFieldCandidate('mo-demote', 'weight');
    assert.equal(override.value, '60');
  });

  it('scopes variant manual overrides to the selected variant', () => {
    ensureProductJson('mo-variant');
    specDb.insertFieldCandidate({
      productId: 'mo-variant',
      fieldKey: 'release_date',
      sourceId: 'old-black',
      sourceType: 'release_date_finder',
      value: '2025-01-01',
      confidence: 0.9,
      status: 'resolved',
      variantId: 'v_black',
      validationJson: {},
      metadataJson: {},
    });
    specDb.insertFieldCandidate({
      productId: 'mo-variant',
      fieldKey: 'release_date',
      sourceId: 'old-white',
      sourceType: 'release_date_finder',
      value: '2025-02-02',
      confidence: 0.9,
      status: 'resolved',
      variantId: 'v_white',
      validationJson: {},
      metadataJson: {},
    });

    publishManualOverride({
      specDb,
      category: 'mouse',
      productId: 'mo-variant',
      fieldKey: 'release_date',
      value: '2026-03-03',
      variantId: 'v_black',
      productRoot: PRODUCT_ROOT,
    });

    const blackRows = specDb.getFieldCandidatesByProductAndField('mo-variant', 'release_date', 'v_black');
    const whiteRows = specDb.getFieldCandidatesByProductAndField('mo-variant', 'release_date', 'v_white');
    assert.ok(blackRows.some((row) => row.source_type === 'manual_override' && row.status === 'resolved'));
    assert.ok(whiteRows.some((row) => row.source_id === 'old-white' && row.status === 'resolved'));

    const pj = readProductJson('mo-variant');
    assert.equal(pj.variant_fields.v_black.release_date.value, '2026-03-03');
    assert.equal(pj.fields.release_date, undefined);
  });
});
