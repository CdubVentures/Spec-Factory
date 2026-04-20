// Characterization: pin winner-picking logic in buildProductReviewPayload
// before the manual-override/clear-published refactor touches this code.
//
// Targets: reviewGridData.js:258-278 (resolvedByField / variantValuesByField
// population — highest-confidence resolved wins; per-variant dict for
// variant-dependent fields) and :420-443 (effectiveRow selection —
// isOverridden gate; default-variant seeding for variant-dependent scalars).
//
// Any behavior change here must either update this file in lock-step
// (with an explicit [STATE: REFACTOR] justification) or surface as a
// deliberate, reviewed semantic change.

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

function makeSpecDbStub({ variants = [], candidates = [], defaultColor = null, variantDependentFields = [] }) {
  const vdSet = new Set(variantDependentFields);
  return {
    getProduct: () => ({ product_id: 'p1', brand: 'Corsair', model: 'M75', variant: '' }),
    getAllFieldCandidatesByProduct: () => candidates,
    getColorEditionFinder: () => ({
      product_id: 'p1', category: 'mouse',
      colors: variants.filter((v) => v.variant_type === 'color').map((v) => v.color_atoms.join('+')),
      editions: variants.filter((v) => v.variant_type === 'edition').map((v) => v.edition_slug),
      default_color: defaultColor,
    }),
    variants: { listActive: () => variants },
    // WHY: isVariantDependentField consults getCompiledRules first and falls
    // back to registry module-class derivation. Provide a minimal rules map
    // so the characterization doesn't depend on registry wiring.
    getCompiledRules: () => ({
      fields: Object.fromEntries(
        [...vdSet].map((key) => [key, { variant_dependent: true }]),
      ),
    }),
  };
}

const VARIANTS = [
  { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color', color_atoms: ['black'], edition_slug: null },
  { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', variant_type: 'color', color_atoms: ['white'], edition_slug: null },
];

test('scalar field: highest-confidence resolved row wins resolvedByField', async () => {
  const candidates = [
    { id: 1, field_key: 'name', variant_id: null, value: 'LoserName', confidence: 0.4, status: 'resolved', source_type: 'pipeline', source_id: 's1', metadata_json: {}, updated_at: '2026-04-01T00:00:00Z' },
    { id: 2, field_key: 'name', variant_id: null, value: 'WinnerName', confidence: 0.9, status: 'resolved', source_type: 'pipeline', source_id: 's2', metadata_json: {}, updated_at: '2026-04-02T00:00:00Z' },
    { id: 3, field_key: 'name', variant_id: null, value: 'NotResolved', confidence: 1.0, status: 'candidate', source_type: 'pipeline', source_id: 's3', metadata_json: {}, updated_at: '2026-04-03T00:00:00Z' },
  ];
  const specDb = makeSpecDbStub({ variants: [], candidates });
  const layout = makeLayout([{ key: 'name' }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  assert.equal(payload.fields.name.selected.value, 'WinnerName', 'highest-confidence resolved wins');
});

test('variant-dependent field: per-variant_id highest-confidence resolved wins', async () => {
  const candidates = [
    { id: 1, field_key: 'release_date', variant_id: 'v_black', value: '2025-05-05', confidence: 0.4, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_b1', metadata_json: {}, updated_at: '2026-04-01T00:00:00Z' },
    { id: 2, field_key: 'release_date', variant_id: 'v_black', value: '2025-11-11', confidence: 0.9, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_b2', metadata_json: {}, updated_at: '2026-04-02T00:00:00Z' },
    { id: 3, field_key: 'release_date', variant_id: 'v_white', value: '2025-12-09', confidence: 0.7, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_w1', metadata_json: {}, updated_at: '2026-04-02T00:00:00Z' },
  ];
  const specDb = makeSpecDbStub({ variants: VARIANTS, candidates, defaultColor: 'black', variantDependentFields: ['release_date'] });
  const layout = makeLayout([{ key: 'release_date', variant_dependent: true }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const field = payload.fields.release_date;
  assert.equal(field.variant_values.v_black.value, '2025-11-11', 'black: higher-confidence wins');
  assert.equal(field.variant_values.v_white.value, '2025-12-09', 'white: only resolved wins');
});

test('scalar field: metadata_json.source === manual_override triggers isOverridden path', async () => {
  const candidates = [
    { id: 1, field_key: 'name', variant_id: null, value: 'PipelineName', confidence: 0.8, status: 'resolved', source_type: 'pipeline', source_id: 's_pipe', metadata_json: {}, updated_at: '2026-04-01T00:00:00Z' },
    { id: 2, field_key: 'name', variant_id: null, value: 'OverrideName', confidence: 1.0, status: 'resolved', source_type: 'manual_override', source_id: 'manual-p1-x', metadata_json: { source: 'manual_override' }, updated_at: '2026-04-02T00:00:00Z' },
  ];
  const specDb = makeSpecDbStub({ variants: [], candidates });
  const layout = makeLayout([{ key: 'name' }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const field = payload.fields.name;
  assert.equal(field.selected.value, 'OverrideName', 'override value wins (highest confidence AND overridden marker)');
  assert.equal(field.overridden, true, 'overridden flag exposed to GUI');
  assert.equal(field.source, 'user', 'source forced to user on override');
  assert.equal(field.method, 'manual_override', 'method forced to manual_override');
  assert.equal(field.selected.confidence, 1, 'override confidence forced to 1');
});

test('variant-dependent field: default variant value drives grid cell when not overridden', async () => {
  const candidates = [
    { id: 1, field_key: 'release_date', variant_id: 'v_black', value: '2025-11-11', confidence: 0.9, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_b', metadata_json: {}, updated_at: '2026-04-02T00:00:00Z' },
    { id: 2, field_key: 'release_date', variant_id: 'v_white', value: '2025-12-09', confidence: 0.95, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_w', metadata_json: {}, updated_at: '2026-04-02T00:00:00Z' },
  ];
  const specDb = makeSpecDbStub({ variants: VARIANTS, candidates, defaultColor: 'black', variantDependentFields: ['release_date'] });
  const layout = makeLayout([{ key: 'release_date', variant_dependent: true }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const field = payload.fields.release_date;
  // Default variant (black) drives the grid cell value, NOT the highest-confidence
  // variant (white at 0.95). This is the default-variant seeding rule.
  assert.equal(field.selected.value, '2025-11-11', 'default variant value seeds grid cell');
  assert.equal(field.variant_values.v_white.value, '2025-12-09', 'other variant still exposed in drawer');
});

test('variant-dependent field: product-level override wins over default variant seeding', async () => {
  const candidates = [
    { id: 1, field_key: 'release_date', variant_id: 'v_black', value: '2025-11-11', confidence: 0.9, status: 'resolved', source_type: 'release_date_finder', source_id: 'rdf_b', metadata_json: {}, updated_at: '2026-04-02T00:00:00Z' },
    { id: 2, field_key: 'release_date', variant_id: null, value: '2099-01-01', confidence: 1.0, status: 'resolved', source_type: 'manual_override', source_id: 'manual-p1-x', metadata_json: { source: 'manual_override' }, updated_at: '2026-04-03T00:00:00Z' },
  ];
  const specDb = makeSpecDbStub({ variants: VARIANTS, candidates, defaultColor: 'black', variantDependentFields: ['release_date'] });
  const layout = makeLayout([{ key: 'release_date', variant_dependent: true }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const field = payload.fields.release_date;
  assert.equal(field.selected.value, '2099-01-01', 'override beats default-variant seeding');
  assert.equal(field.overridden, true, 'overridden flag still set');
});

test('only candidate rows (no resolved) → no value, field still emitted because candidates exist', async () => {
  const candidates = [
    { id: 1, field_key: 'name', variant_id: null, value: 'NotResolved', confidence: 0.6, status: 'candidate', source_type: 'pipeline', source_id: 's1', metadata_json: {}, updated_at: '2026-04-01T00:00:00Z' },
  ];
  const specDb = makeSpecDbStub({ variants: [], candidates });
  const layout = makeLayout([{ key: 'name' }]);

  const payload = await buildProductReviewPayload({
    storage: {}, config: {}, category: 'mouse', productId: 'p1',
    layout, specDb, catalogProduct: { brand: 'Corsair', model: 'M75' },
  });

  const field = payload.fields.name;
  assert.equal(field.selected.value, null, 'no resolved → no value');
  assert.equal(field.overridden, false, 'no override marker');
  assert.ok(Array.isArray(field.candidates) && field.candidates.length === 1, 'candidate pool preserved');
});
