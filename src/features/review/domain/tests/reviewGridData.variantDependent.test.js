// WHY: Variant-dependent fields (e.g. release_date, owned by a variantFieldProducer module)
// must expose per-variant published state in the review payload. Candidates must carry
// variant_id/variant_label/variant_type/color_atoms/edition_slug so the drawer can render
// a variant×value table and label candidate cards without relying on opaque metadata_json.

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

function makeSpecDbStub({ variants = [], candidates = [] }) {
  return {
    getProduct: () => ({ product_id: 'p1', brand: 'Corsair', model: 'M75', variant: 'Wireless' }),
    getAllFieldCandidatesByProduct: () => candidates,
    variants: {
      listActive: () => variants,
    },
  };
}

test('buildProductReviewPayload populates variant_values for variant-dependent field', async () => {
  const variants = [
    { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color', color_atoms: ['black'], edition_slug: null },
    { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', variant_type: 'color', color_atoms: ['white'], edition_slug: null },
  ];
  const candidates = [
    { id: 1, field_key: 'release_date', variant_id: 'v_black', value: '2025-11-11', confidence: 1.0, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_1', metadata_json: {}, updated_at: '2026-04-17T10:00:00Z' },
    { id: 2, field_key: 'release_date', variant_id: 'v_white', value: '2025-12-09', confidence: 1.0, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_2', metadata_json: {}, updated_at: '2026-04-17T10:00:00Z' },
  ];
  const specDb = makeSpecDbStub({ variants, candidates });
  const layout = makeLayout([{ key: 'release_date', variant_dependent: true }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const field = payload.fields.release_date;
  assert.ok(field.variant_values, 'expected variant_values populated');
  assert.ok(field.variant_values.v_black, 'expected v_black entry');
  assert.ok(field.variant_values.v_white, 'expected v_white entry');
  assert.equal(field.variant_values.v_black.value, '2025-11-11');
  assert.equal(field.variant_values.v_white.value, '2025-12-09');
  assert.equal(field.variant_values.v_black.confidence, 1.0);
});

test('buildProductReviewPayload omits variant_values for scalar field', async () => {
  const candidates = [
    { id: 1, field_key: 'weight', variant_id: null, value: '59', confidence: 0.95, status: 'resolved', source_type: 'pipeline', source_id: 'p_1', metadata_json: {}, updated_at: '' },
  ];
  const specDb = makeSpecDbStub({ variants: [], candidates });
  const layout = makeLayout([{ key: 'weight', variant_dependent: false, type: 'number' }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  assert.equal(payload.fields.weight.variant_values, undefined,
    'scalar fields must not emit variant_values');
  assert.equal(payload.fields.weight.selected.value, '59');
});

test('buildProductReviewPayload enriches variant-dependent candidates with variant_label + variant_type + color_atoms', async () => {
  const variants = [
    { variant_id: 'v_ed1', variant_key: 'edition:cod-bo7', variant_label: 'Call of Duty® Black Ops 7 Edition', variant_type: 'edition', color_atoms: ['black'], edition_slug: 'cod-bo7' },
  ];
  const candidates = [
    { id: 1, field_key: 'release_date', variant_id: 'v_ed1', value: '2025-11-11', confidence: 1.0, status: 'candidate', source_type: 'release_date_finder', source_id: 'rdf_1', metadata_json: {}, updated_at: '' },
  ];
  const specDb = makeSpecDbStub({ variants, candidates });
  const layout = makeLayout([{ key: 'release_date', variant_dependent: true }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const cands = payload.fields.release_date.candidates;
  assert.equal(cands.length, 1);
  assert.equal(cands[0].variant_id, 'v_ed1');
  assert.equal(cands[0].variant_label, 'Call of Duty® Black Ops 7 Edition');
  assert.equal(cands[0].variant_type, 'edition');
  assert.deepEqual(cands[0].color_atoms, ['black']);
  assert.equal(cands[0].edition_slug, 'cod-bo7');
});

test('buildProductReviewPayload leaves variant fields absent on scalar-field candidates', async () => {
  const candidates = [
    { id: 1, field_key: 'weight', variant_id: null, value: '59', confidence: 0.95, status: 'candidate', source_type: 'pipeline', source_id: 'p_1', metadata_json: {}, updated_at: '' },
  ];
  const specDb = makeSpecDbStub({ variants: [], candidates });
  const layout = makeLayout([{ key: 'weight', variant_dependent: false }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const c = payload.fields.weight.candidates[0];
  assert.equal(c.variant_id ?? null, null);
  assert.equal(c.variant_label ?? null, null);
});
