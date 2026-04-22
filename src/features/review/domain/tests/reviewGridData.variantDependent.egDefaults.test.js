// WHY: Regression guard for the review drawer payload shape.
//
// Colors and editions are variant-GENERATORS (CEF) — their VALUES are the
// variant identities. They publish to product.json.fields.<key> as a JSON
// list (not to product.json.variant_fields[vid][key]) — that part is owned
// by the publisher and is not under test here.
//
// The review grid drawer, however, renders colors/editions as per-variant
// rows so each combo/slug can show its own color swatch and per-variant
// source list (from CEF identity-check evidence). The backend therefore
// emits variant_values on the drawer payload for these fields too —
// keyed by variant_id, value = combo/slug, enriched with variant metadata
// and variant_key. This test locks in that drawer-payload contract.
//
// Only variant-attribute fields (release_date, future discontinued/SKU/price)
// get field_rule.variant_dependent: true. Variant-generator fields keep
// variant_dependent: false — the drawer treats them uniformly via the
// variant_values map regardless of the flag.

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
    variants: { listActive: () => variants },
    getCompiledRules: () => ({ fields: {
      colors: { variant_dependent: false },
      editions: { variant_dependent: false },
      release_date: { variant_dependent: true },
    } }),
  };
}

test('colors emits variant_values keyed by variant_id with combo values + variant metadata', async () => {
  const variants = [
    { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black',
      variant_type: 'color', color_atoms: ['black'], edition_slug: null },
    { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White',
      variant_type: 'color', color_atoms: ['white'], edition_slug: null },
  ];
  const specDb = makeSpecDbStub({ variants, candidates: [] });
  const layout = makeLayout([{ key: 'colors', variant_dependent: false }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  // Published value is still the flat list projected from variants (publish
  // contract unchanged — goes to product.json.fields.colors, not variant_fields).
  const parsed = JSON.parse(payload.fields.colors.selected.value);
  assert.deepEqual(parsed, ['black', 'white']);

  // Drawer payload now carries per-variant rows so each combo gets its own
  // row + source list.
  const vv = payload.fields.colors.variant_values;
  assert.ok(vv, 'colors must emit variant_values for drawer per-variant rendering');
  assert.equal(vv.v_black.value, 'black');
  assert.equal(vv.v_black.variant_label, 'Black');
  assert.equal(vv.v_black.variant_type, 'color');
  assert.deepEqual(vv.v_black.color_atoms, ['black']);
  assert.equal(vv.v_black.variant_key, 'color:black');
  // WHY: No CEF field_candidates seeded → no honest confidence to report.
  // Contract: confidence is derived from field_candidates (LLM-rated, normalized
  // to 0-1), not stamped. Falls to 0 when no candidate data exists for the variant.
  assert.equal(vv.v_black.confidence, 0);
  assert.equal(vv.v_white.value, 'white');
  assert.equal(vv.v_white.variant_key, 'color:white');
});

test('colors variant_values.confidence reads from CEF field_candidates, normalized to 0-1', async () => {
  const variants = [
    { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black',
      variant_type: 'color', color_atoms: ['black'], edition_slug: null },
    { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White',
      variant_type: 'color', color_atoms: ['white'], edition_slug: null },
  ];
  // Backend stores integer 0-100 (LLM scale); frontend grid expects fraction 0-1.
  const candidates = [
    { field_key: 'colors', source_type: 'cef', variant_id: 'v_black', confidence: 85, value: '["black"]', status: 'candidate' },
    { field_key: 'colors', source_type: 'cef', variant_id: 'v_white', confidence: 72, value: '["white"]', status: 'candidate' },
  ];
  const specDb = makeSpecDbStub({ variants, candidates });
  const layout = makeLayout([{ key: 'colors', variant_dependent: false }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const vv = payload.fields.colors.variant_values;
  assert.equal(vv.v_black.confidence, 0.85, 'integer 85 → fraction 0.85');
  assert.equal(vv.v_white.confidence, 0.72, 'integer 72 → fraction 0.72');
  // Field-level selected.confidence = min across per-variant = min(0.85, 0.72) = 0.72
  assert.equal(payload.fields.colors.selected.confidence, 0.72,
    'field-level colors.confidence = min per-variant (weakest-link aggregate)');
});

test('editions emits variant_values keyed by variant_id with edition_slug values', async () => {
  const variants = [
    { variant_id: 'v_ed1', variant_key: 'edition:cod-bo7',
      variant_label: 'Call of Duty® Black Ops 7 Edition',
      variant_type: 'edition', color_atoms: ['black'], edition_slug: 'cod-bo7' },
  ];
  const specDb = makeSpecDbStub({ variants });
  const layout = makeLayout([{ key: 'editions', variant_dependent: false }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: {},
  });

  const parsed = JSON.parse(payload.fields.editions.selected.value);
  assert.deepEqual(parsed, ['cod-bo7']);

  const vv = payload.fields.editions.variant_values;
  assert.ok(vv, 'editions must emit variant_values for drawer per-variant rendering');
  assert.equal(vv.v_ed1.value, 'cod-bo7');
  assert.equal(vv.v_ed1.variant_type, 'edition');
  assert.equal(vv.v_ed1.edition_slug, 'cod-bo7');
  assert.equal(vv.v_ed1.variant_key, 'edition:cod-bo7');
  assert.deepEqual(vv.v_ed1.color_atoms, ['black']);
});

test('edition combo cascades into colors variant_values with variant_type=edition', async () => {
  // WHY: An edition IS a color variant — its combo is also a colors entry.
  // The colors field's variant_values entry for that edition's variant_id
  // must keep variant_type='edition' so the drawer can badge it distinctly
  // and resolve variant_key against CEF's identity-check mappings.
  const variants = [
    { variant_id: 'v_ed1', variant_key: 'edition:cod-bo7',
      variant_label: 'Call of Duty® Black Ops 7 Edition',
      variant_type: 'edition', color_atoms: ['black', 'red'], edition_slug: 'cod-bo7' },
    { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black',
      variant_type: 'color', color_atoms: ['black'], edition_slug: null },
  ];
  const specDb = makeSpecDbStub({ variants });
  const layout = makeLayout([{ key: 'colors', variant_dependent: false }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: {},
  });

  const vv = payload.fields.colors.variant_values;
  assert.ok(vv);
  assert.equal(vv.v_ed1.value, 'black+red', 'edition combo string lands in colors vv');
  assert.equal(vv.v_ed1.variant_type, 'edition');
  assert.equal(vv.v_ed1.variant_key, 'edition:cod-bo7');
  assert.equal(vv.v_black.value, 'black');
  assert.equal(vv.v_black.variant_type, 'color');
  assert.equal(vv.v_black.variant_key, 'color:black');
});

test('release_date DOES emit variant_values (regression: variant-attribute path still works)', async () => {
  const variants = [
    { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black',
      variant_type: 'color', color_atoms: ['black'], edition_slug: null },
  ];
  const candidates = [
    { id: 1, field_key: 'release_date', variant_id: 'v_black', value: '2025-12-09',
      confidence: 1.0, status: 'resolved', source_type: 'release_date_finder',
      source_id: 'rdf_1', metadata_json: {}, updated_at: '2026-04-17T10:00:00Z' },
  ];
  const specDb = makeSpecDbStub({ variants, candidates });
  const layout = makeLayout([{ key: 'release_date', variant_dependent: true }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: {},
  });

  const vv = payload.fields.release_date.variant_values;
  assert.ok(vv, 'release_date is variant-dependent — must emit variant_values');
  assert.equal(vv.v_black.value, '2025-12-09');
  assert.equal(vv.v_black.variant_label, 'Black');
  assert.equal(vv.v_black.variant_key, 'color:black', 'variant_key propagated from variant registry');
});
