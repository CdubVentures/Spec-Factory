// WHY: Regression guard. Colors and editions are variant-GENERATORS (CEF), not
// variant-dependent attributes. The field values ARE the variant identities
// (variant v_black IS the color "black") — so they publish to product.json.fields
// as a list, never to product.json.variant_fields[vid]. The review drawer must
// render them as "Published Variant" + flat list (existing CEF path), not as a
// per-variant value table.
//
// Only variant-attribute fields (release_date, future discontinued/SKU/price)
// get variant_dependent: true and emit variant_values — see the sibling test
// reviewGridData.variantDependent.test.js for the positive assertions.

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
    variants: { listActive: () => variants },
    getCompiledRules: () => ({ fields: {
      colors: { variant_dependent: false },
      editions: { variant_dependent: false },
      release_date: { variant_dependent: true },
    } }),
  };
}

test('colors does NOT emit variant_values even when variants exist (CEF is variant-backed, not variant-dependent)', async () => {
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

  assert.equal(payload.fields.colors.variant_values, undefined,
    'colors is variant-backed, NOT variant-dependent — drawer renders list, not per-variant table');
  // Published value is still the list projected from variants.
  const parsed = JSON.parse(payload.fields.colors.selected.value);
  assert.deepEqual(parsed, ['black', 'white']);
});

test('editions does NOT emit variant_values even when edition variants exist', async () => {
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

  assert.equal(payload.fields.editions.variant_values, undefined,
    'editions is variant-backed, NOT variant-dependent');
  const parsed = JSON.parse(payload.fields.editions.selected.value);
  assert.deepEqual(parsed, ['cod-bo7']);
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
});
