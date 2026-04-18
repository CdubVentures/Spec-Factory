// WHY: buildProductReviewPayload must omit field entries with no signal to keep the
// products-index response linear in *real data* rather than layout × products. An "empty"
// field (no published value, no candidates, no variant_values, no override) carries zero
// bits — the frontend grid derives defaults from layout.rows when fields[key] is missing.
// This contract is the difference between an 8.9 MB response and ~20 KB on mouse.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductReviewPayload } from '../reviewGridData.js';

function makeLayout(fields) {
  const rows = fields.map((f) => ({
    group: '',
    key: f.key,
    label: f.label || f.key,
    field_rule: {
      type: f.type || 'string',
      required: false,
      units: null,
      enum_name: null,
      component_type: null,
      enum_source: null,
      variant_dependent: Boolean(f.variant_dependent),
    },
    source_row: null,
  }));
  return { category: 'mouse', rows, field_studio: {} };
}

function makeSpecDbStub({ variants = [], candidates = [], product = { product_id: 'p1', brand: 'Corsair', model: 'M75', variant: 'Wireless' } }) {
  return {
    getProduct: () => product,
    getAllFieldCandidatesByProduct: () => candidates,
    variants: { listActive: () => variants },
  };
}

test('fields map omits entries with no value, no candidates, no variant_values, no override', async () => {
  const specDb = makeSpecDbStub({ candidates: [] });
  const layout = makeLayout([
    { key: 'weight' },
    { key: 'dpi' },
    { key: 'sensor' },
  ]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  assert.deepEqual(payload.fields, {}, 'empty product must emit empty fields map');
});

test('fields map includes entries that have a resolved value', async () => {
  const candidates = [
    { id: 1, field_key: 'weight', variant_id: null, value: '59', confidence: 0.95, status: 'resolved', source_type: 'pipeline', source_id: 'p_1', metadata_json: {}, updated_at: '' },
  ];
  const specDb = makeSpecDbStub({ candidates });
  const layout = makeLayout([{ key: 'weight' }, { key: 'dpi' }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  assert.ok(payload.fields.weight, 'weight with resolved value must be emitted');
  assert.equal(payload.fields.weight.selected.value, '59');
  assert.equal(payload.fields.dpi, undefined, 'dpi with no signal must be omitted');
});

test('fields map includes entries that have candidates but no resolved value', async () => {
  const candidates = [
    { id: 1, field_key: 'dpi', variant_id: null, value: '16000', confidence: 0.4, status: 'candidate', source_type: 'scrape', source_id: 's_1', metadata_json: {}, updated_at: '' },
  ];
  const specDb = makeSpecDbStub({ candidates });
  const layout = makeLayout([{ key: 'dpi' }, { key: 'weight' }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  assert.ok(payload.fields.dpi, 'dpi with candidates but no resolved value must be emitted');
  assert.equal(payload.fields.dpi.candidate_count, 1);
  assert.equal(payload.fields.weight, undefined);
});

test('fields map includes entries that have a manual override (even if value coincides)', async () => {
  const candidates = [
    { id: 1, field_key: 'weight', variant_id: null, value: '59', confidence: 1, status: 'resolved', source_type: 'manual_override', source_id: 'user', metadata_json: { source: 'manual_override' }, updated_at: '' },
  ];
  const specDb = makeSpecDbStub({ candidates });
  const layout = makeLayout([{ key: 'weight' }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  assert.ok(payload.fields.weight);
  assert.equal(payload.fields.weight.overridden, true);
});

test('fields map includes variant-dependent entries that have variant_values', async () => {
  const variants = [
    { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color', color_atoms: ['black'], edition_slug: null },
  ];
  const candidates = [
    { id: 1, field_key: 'release_date', variant_id: 'v_black', value: '2025-11-11', confidence: 1.0, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_1', metadata_json: {}, updated_at: '' },
  ];
  const specDb = makeSpecDbStub({ variants, candidates });
  const layout = makeLayout([{ key: 'release_date', variant_dependent: true }, { key: 'weight' }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  assert.ok(payload.fields.release_date, 'release_date with variant_values must be emitted');
  assert.ok(payload.fields.release_date.variant_values);
  assert.equal(payload.fields.weight, undefined, 'weight with no signal must be omitted');
});

test('metrics.missing still counts omitted empty fields', async () => {
  const candidates = [
    { id: 1, field_key: 'weight', variant_id: null, value: '59', confidence: 0.95, status: 'resolved', source_type: 'pipeline', source_id: 'p_1', metadata_json: {}, updated_at: '' },
  ];
  const specDb = makeSpecDbStub({ candidates });
  // 5 fields in layout, only weight has data → 4 missing
  const layout = makeLayout([
    { key: 'weight' }, { key: 'dpi' }, { key: 'sensor' }, { key: 'switch_type' }, { key: 'connection' },
  ]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  assert.equal(Object.keys(payload.fields).length, 1, 'only 1 field emitted');
  assert.equal(payload.metrics.missing, 4, 'missing count must include layout fields not emitted');
});

test('metrics.coverage uses layout.rows.length as denominator (unchanged by sparse emission)', async () => {
  const candidates = [
    { id: 1, field_key: 'weight', variant_id: null, value: '59', confidence: 1, status: 'resolved', source_type: 'pipeline', source_id: 'p_1', metadata_json: {}, updated_at: '' },
    { id: 2, field_key: 'dpi', variant_id: null, value: '16000', confidence: 1, status: 'resolved', source_type: 'pipeline', source_id: 'p_2', metadata_json: {}, updated_at: '' },
  ];
  const specDb = makeSpecDbStub({ candidates });
  const layout = makeLayout([
    { key: 'weight' }, { key: 'dpi' }, { key: 'sensor' }, { key: 'switch_type' },
  ]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  // 2 known / 4 total = 0.5
  assert.equal(payload.metrics.coverage, 0.5);
});

test('fully-empty product yields has_run=false and empty fields map', async () => {
  const specDb = makeSpecDbStub({ candidates: [], variants: [] });
  const layout = makeLayout([{ key: 'weight' }, { key: 'dpi' }, { key: 'sensor' }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  assert.deepEqual(payload.fields, {});
  assert.equal(payload.metrics.has_run, false);
  assert.equal(payload.metrics.missing, 3);
  assert.equal(payload.metrics.coverage, 0);
});
