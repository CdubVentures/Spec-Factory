// WHY: The default variant (CEF's color:<default_color>) drives the grid cell
// value for scalar variant-dependent fields and gets an is_default marker in
// the drawer. Editions never carry is_default.

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

function makeSpecDbStub({ variants = [], candidates = [], defaultColor = null }) {
  return {
    getProduct: () => ({ product_id: 'p1', brand: 'Corsair', model: 'M75', variant: '' }),
    getAllFieldCandidatesByProduct: () => candidates,
    getColorEditionFinder: () => ({
      product_id: 'p1', category: 'mouse',
      colors: variants.filter(v => v.variant_type === 'color').map(v => v.color_atoms.join('+')),
      editions: variants.filter(v => v.variant_type === 'edition').map(v => v.edition_slug),
      default_color: defaultColor,
    }),
    variants: {
      listActive: () => variants,
    },
  };
}

const VARIANTS = [
  { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color', color_atoms: ['black'], edition_slug: null },
  { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', variant_type: 'color', color_atoms: ['white'], edition_slug: null },
  { variant_id: 'v_doom',  variant_key: 'edition:doom-edition', variant_label: 'DOOM Edition', variant_type: 'edition', color_atoms: ['black','red'], edition_slug: 'doom-edition', edition_display_name: 'DOOM Edition' },
];

test('colors field: is_default stamped on the default_color variant only', async () => {
  const specDb = makeSpecDbStub({ variants: VARIANTS, defaultColor: 'black' });
  const layout = makeLayout([{ key: 'colors' }]);
  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const vvs = payload.fields.colors.variant_values;
  assert.ok(vvs, 'variant_values populated for colors');
  assert.equal(vvs.v_black.is_default, true, 'default color is_default=true');
  assert.equal(vvs.v_white.is_default, false, 'non-default color is_default=false');
  // Edition cascaded into colorsVariantValues stays not-default
  assert.equal(vvs.v_doom.is_default, false, 'edition cascaded into colors stays not-default');
});

test('editions field: no variant is marked default', async () => {
  const specDb = makeSpecDbStub({ variants: VARIANTS, defaultColor: 'black' });
  const layout = makeLayout([{ key: 'editions' }]);
  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const vvs = payload.fields.editions.variant_values;
  assert.ok(vvs, 'variant_values populated for editions');
  const anyDefault = Object.values(vvs).some(e => e.is_default === true);
  assert.equal(anyDefault, false, 'editions drawer never has a default variant');
});

test('variant-dependent field (release_date): default variant is_default + drives grid cell value', async () => {
  const candidates = [
    { id: 1, field_key: 'release_date', variant_id: 'v_black', value: '2025-11-11', confidence: 1.0, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_1', metadata_json: {}, updated_at: '' },
    { id: 2, field_key: 'release_date', variant_id: 'v_white', value: '2025-12-09', confidence: 1.0, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_2', metadata_json: {}, updated_at: '' },
    { id: 3, field_key: 'release_date', variant_id: 'v_doom',  value: '2026-01-05', confidence: 1.0, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_3', metadata_json: {}, updated_at: '' },
  ];
  const specDb = makeSpecDbStub({ variants: VARIANTS, candidates, defaultColor: 'black' });
  const layout = makeLayout([{ key: 'release_date', variant_dependent: true }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const field = payload.fields.release_date;
  // Default variant flagged, others not
  assert.equal(field.variant_values.v_black.is_default, true);
  assert.equal(field.variant_values.v_white.is_default, false);
  assert.equal(field.variant_values.v_doom.is_default, false);

  // Grid cell shows the default variant's value
  assert.equal(field.selected.value, '2025-11-11',
    'grid cell seeded from default variant (black) release_date');
});

test('variant-dependent field with no default_color: no variant is flagged default', async () => {
  const candidates = [
    { id: 1, field_key: 'release_date', variant_id: 'v_black', value: '2025-11-11', confidence: 1.0, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_1', metadata_json: {}, updated_at: '' },
  ];
  const specDb = makeSpecDbStub({ variants: VARIANTS, candidates, defaultColor: null });
  const layout = makeLayout([{ key: 'release_date', variant_dependent: true }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const field = payload.fields.release_date;
  // No default_color → no default variant_id resolved → nobody is flagged
  assert.equal(field.variant_values.v_black.is_default, false);
});
