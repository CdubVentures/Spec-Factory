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

// seedField removed — item_field_state table retired in Phase 1b

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

// DB integration tests for getProvenanceForProduct removed — item_field_state retired in Phase 1b.

test('DB: no rows for product → {}', () => {
  const db = createHarness();
  const result = db.getProvenanceForProduct('mouse', 'mouse-nonexistent');
  assert.deepStrictEqual(result, {});
});

// ── getNormalizedForProduct (stubbed — item_field_state retired, fields always {}) ──

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

test('getNormalizedForProduct: returns identity from products table', () => {
  const db = createHarness();
  seedProduct(db, { productId: 'mouse-test', brand: 'Razer', model: 'Viper V3 Pro', variant: 'White' });

  const result = db.getNormalizedForProduct('mouse-test');
  assert.equal(result.identity.brand, 'Razer');
  assert.equal(result.identity.model, 'Viper V3 Pro');
  assert.equal(result.identity.variant, 'White');
  assert.deepStrictEqual(result.fields, {});
});
