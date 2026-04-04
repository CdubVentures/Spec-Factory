// Contract: getProvenanceForProduct(category, productId) → ProvenanceMap | {}
//
// Input: category (string), productId (string)
// Output: flat object { [fieldKey]: { value, confidence, host, source, source_id, url,
//   snippet_id, snippet_hash, quote, evidence: [] } }
//
// Invariants:
//   - Returns {} (not null) when no rows exist
//   - evidence is always an empty array (candidates table removed; no JOIN)
//   - host/source_id/url/snippet_id/snippet_hash/quote default to '' when absent

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProvenanceFromRows } from '../stores/provenanceStore.js';
import { SpecDb } from '../specDb.js';

function createHarness() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function seedField(db, opts) {
  const {
    category = 'mouse', productId, fieldKey, value = 'test',
    confidence = 0.95, source = 'pipeline', acceptedCandidateId = null,
  } = opts;
  db.db.prepare(`INSERT INTO item_field_state (
    category, product_id, field_key, value, confidence, source, accepted_candidate_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    category, productId, fieldKey, value, confidence, source, acceptedCandidateId,
  );
}

// ── Pure function: buildProvenanceFromRows ──

test('buildProvenanceFromRows: empty rows → {}', () => {
  assert.deepStrictEqual(buildProvenanceFromRows([]), {});
});

test('buildProvenanceFromRows: single row (item_field_state only) — basic shape', () => {
  const row = {
    field_key: 'weight', value: '59g', confidence: 0.95, source: 'pipeline',
    accepted_candidate_id: 'c-1',
  };
  const result = buildProvenanceFromRows([row]);
  assert.equal(result.weight.value, '59g');
  assert.equal(result.weight.confidence, 0.95);
  assert.equal(result.weight.source, 'pipeline');
  assert.equal(result.weight.host, '');
  assert.equal(result.weight.url, '');
  assert.equal(result.weight.snippet_id, '');
  assert.deepStrictEqual(result.weight.evidence, []);
});

test('buildProvenanceFromRows: row with no accepted candidate → empty evidence', () => {
  const row = {
    field_key: 'weight', value: '59g', confidence: 0.5, source: 'pipeline',
    accepted_candidate_id: null,
  };
  const result = buildProvenanceFromRows([row]);
  assert.equal(result.weight.value, '59g');
  assert.equal(result.weight.confidence, 0.5);
  assert.equal(result.weight.host, '');
  assert.equal(result.weight.url, '');
  assert.deepStrictEqual(result.weight.evidence, []);
});

test('buildProvenanceFromRows: evidence always [] when candidate columns absent', () => {
  const row = {
    field_key: 'weight', value: 'x', confidence: 0, source: 'pipeline',
    accepted_candidate_id: 'c-1',
  };
  const result = buildProvenanceFromRows([row]);
  assert.deepStrictEqual(result.weight.evidence, []);
});

// ── DB integration: getProvenanceForProduct ──

test('DB: no rows for product → {}', () => {
  const db = createHarness();
  const result = db.getProvenanceForProduct('mouse', 'mouse-nonexistent');
  assert.deepStrictEqual(result, {});
});

test('DB: field with accepted_candidate_id set — evidence still empty (no candidates table)', () => {
  const db = createHarness();
  seedField(db, { productId: 'mouse-test', fieldKey: 'weight', value: '59g', confidence: 0.95, acceptedCandidateId: 'c-weight-1' });

  const result = db.getProvenanceForProduct('mouse', 'mouse-test');
  assert.ok(result.weight);
  assert.equal(result.weight.value, '59g');
  assert.equal(result.weight.confidence, 0.95);
  assert.equal(result.weight.host, '');
  assert.deepStrictEqual(result.weight.evidence, []);
});

test('DB: field with no accepted candidate — empty evidence', () => {
  const db = createHarness();
  seedField(db, { productId: 'mouse-test', fieldKey: 'sensor', value: 'PAW3950', confidence: 0.8 });

  const result = db.getProvenanceForProduct('mouse', 'mouse-test');
  assert.ok(result.sensor);
  assert.equal(result.sensor.value, 'PAW3950');
  assert.equal(result.sensor.confidence, 0.8);
  assert.deepStrictEqual(result.sensor.evidence, []);
});

test('DB: multiple fields keyed correctly', () => {
  const db = createHarness();
  seedField(db, { productId: 'mouse-test', fieldKey: 'weight', value: '59g', acceptedCandidateId: 'c-w' });
  seedField(db, { productId: 'mouse-test', fieldKey: 'sensor', value: 'PAW3950' });
  seedField(db, { productId: 'mouse-test', fieldKey: 'shape', value: 'ambidextrous' });

  const result = db.getProvenanceForProduct('mouse', 'mouse-test');
  assert.equal(Object.keys(result).length, 3);
  assert.ok(result.weight);
  assert.ok(result.sensor);
  assert.ok(result.shape);
});

test('DB: category isolation', () => {
  const db = createHarness();
  seedField(db, { category: 'mouse', productId: 'mouse-test', fieldKey: 'weight', value: '59g' });
  seedField(db, { category: 'keyboard', productId: 'kb-test', fieldKey: 'weight', value: '500g' });

  const mouseResult = db.getProvenanceForProduct('mouse', 'mouse-test');
  const kbResult = db.getProvenanceForProduct('mouse', 'kb-test');
  assert.equal(Object.keys(mouseResult).length, 1);
  assert.deepStrictEqual(kbResult, {});
});

test('DB: null value in item_field_state → empty string', () => {
  const db = createHarness();
  db.db.prepare(`INSERT INTO item_field_state (category, product_id, field_key, value, confidence, source) VALUES (?, ?, ?, NULL, 0, 'pipeline')`).run('mouse', 'mouse-test', 'weight');

  const result = db.getProvenanceForProduct('mouse', 'mouse-test');
  assert.equal(result.weight.value, '');
});

test('DB: null confidence → 0', () => {
  const db = createHarness();
  db.db.prepare(`INSERT INTO item_field_state (category, product_id, field_key, value, confidence, source) VALUES (?, ?, ?, 'x', NULL, 'pipeline')`).run('mouse', 'mouse-test', 'weight');

  const result = db.getProvenanceForProduct('mouse', 'mouse-test');
  assert.equal(result.weight.confidence, 0);
});

test('DB: accepted_candidate_id present but no candidates table → empty evidence', () => {
  const db = createHarness();
  seedField(db, { productId: 'mouse-test', fieldKey: 'weight', value: '59g', acceptedCandidateId: 'c-full' });

  const result = db.getProvenanceForProduct('mouse', 'mouse-test');
  assert.ok(result.weight);
  assert.equal(result.weight.value, '59g');
  assert.deepStrictEqual(result.weight.evidence, []);
});

// ── getNormalizedForProduct ──

function seedProduct(db, { category = 'mouse', productId, brand = '', model = '', variant = '' }) {
  db.db.prepare(`INSERT INTO products (category, product_id, brand, model, variant) VALUES (?, ?, ?, ?, ?)`).run(
    category, productId, brand, model, variant,
  );
}

test('getNormalizedForProduct: no rows → empty fields + empty identity', () => {
  const db = createHarness();
  const result = db.getNormalizedForProduct('mouse-nonexistent');
  assert.deepStrictEqual(result.fields, {});
  assert.equal(result.identity.brand, '');
  assert.equal(result.identity.model, '');
  assert.equal(result.identity.variant, '');
});

test('getNormalizedForProduct: returns fields map from item_field_state', () => {
  const db = createHarness();
  seedField(db, { productId: 'mouse-test', fieldKey: 'weight', value: '59g' });
  seedField(db, { productId: 'mouse-test', fieldKey: 'sensor', value: 'PAW3950' });

  const result = db.getNormalizedForProduct('mouse-test');
  assert.equal(result.fields.weight, '59g');
  assert.equal(result.fields.sensor, 'PAW3950');
  assert.equal(Object.keys(result.fields).length, 2);
});

test('getNormalizedForProduct: returns identity from products table', () => {
  const db = createHarness();
  seedProduct(db, { productId: 'mouse-test', brand: 'Razer', model: 'Viper V3 Pro', variant: 'White' });
  seedField(db, { productId: 'mouse-test', fieldKey: 'weight', value: '59g' });

  const result = db.getNormalizedForProduct('mouse-test');
  assert.equal(result.identity.brand, 'Razer');
  assert.equal(result.identity.model, 'Viper V3 Pro');
  assert.equal(result.identity.variant, 'White');
  assert.equal(result.fields.weight, '59g');
});

// --- getSummaryForProduct / getTrafficLightForProduct (C4) ---

test('getSummaryForProduct: no product run → null', () => {
  const db = createHarness();
  const result = db.getSummaryForProduct('mouse-nonexistent');
  assert.equal(result, null);
});

test('getSummaryForProduct: returns parsed summary from product_runs', () => {
  const db = createHarness();
  db.upsertProductRun({
    product_id: 'mouse-test',
    run_id: 'run_001',
    is_latest: true,
    summary: {
      validated: true,
      confidence: 0.85,
      coverage_overall: 0.92,
      missing_required_fields: ['sensor'],
    },
    validated: true,
    confidence: 0.85,
    run_at: '2026-03-29T00:00:00.000Z',
  });
  const summary = db.getSummaryForProduct('mouse-test');
  assert.equal(summary.validated, true);
  assert.equal(summary.confidence, 0.85);
  assert.equal(summary.coverage_overall, 0.92);
  assert.deepStrictEqual(summary.missing_required_fields, ['sensor']);
});

test('getSummaryForProduct: includes nested traffic_light', () => {
  const db = createHarness();
  db.upsertProductRun({
    product_id: 'mouse-tl',
    run_id: 'run_002',
    is_latest: true,
    summary: {
      validated: true,
      confidence: 0.9,
      traffic_light: { counts: { green: 5, yellow: 2, red: 1 }, by_field: {} },
    },
    validated: true,
    confidence: 0.9,
    run_at: '2026-03-29T00:00:00.000Z',
  });
  const summary = db.getSummaryForProduct('mouse-tl');
  assert.equal(summary.traffic_light.counts.green, 5);
  assert.equal(summary.traffic_light.counts.yellow, 2);
  assert.equal(summary.traffic_light.counts.red, 1);
});

test('getTrafficLightForProduct: extracts traffic_light from summary', () => {
  const db = createHarness();
  db.upsertProductRun({
    product_id: 'mouse-tl2',
    run_id: 'run_003',
    is_latest: true,
    summary: {
      validated: true,
      confidence: 0.8,
      traffic_light: { counts: { green: 3 }, by_field: { weight: 'green' } },
    },
    validated: true,
    confidence: 0.8,
    run_at: '2026-03-29T00:00:00.000Z',
  });
  const tl = db.getTrafficLightForProduct('mouse-tl2');
  assert.equal(tl.counts.green, 3);
  assert.equal(tl.by_field.weight, 'green');
});

test('getTrafficLightForProduct: no product run → null', () => {
  const db = createHarness();
  const result = db.getTrafficLightForProduct('mouse-nonexistent');
  assert.equal(result, null);
});
