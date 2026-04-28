/**
 * productResolvedStateReader — unit tests (pure helpers, stubbed specDb).
 *
 * Covers the four exports:
 *   buildComponentRelationIndex
 *   resolveProductComponentInventory
 *   resolveKeyComponentRelation
 *   readProductScopedFactsByProduct
 *   resolveVariantInventory
 *   buildFieldIdentityUsage
 *   resolveKeyFinderRuntimeContext
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComponentRelationIndex,
  resolveProductComponentInventory,
  resolveKeyComponentRelation,
  readKnownFieldsByProduct,
  readProductScopedFactsByProduct,
  resolveVariantInventory,
  buildFieldIdentityUsage,
  resolveKeyFinderRuntimeContext,
} from '../productResolvedStateReader.js';

// ── Fixtures ────────────────────────────────────────────────────────────

// Parent-component rule shape — Phase 1: property lists no longer live in the
// compiled rule, so the test fixture only carries the type/source. The
// property list comes via the SOURCES fixture below (mirroring
// field_studio_map.component_sources, the runtime SSOT).
function parentRule(type) {
  return {
    field_key: type,
    component: {
      type,
      source: `component_db.${type}`,
    },
    contract: { type: 'string', shape: 'scalar' },
    group: type,
  };
}

function subfieldRule(key, contractType = 'string') {
  return { field_key: key, component: null, contract: { type: contractType, shape: 'scalar' } };
}

function scalarRule(key) {
  return { field_key: key, component: null, contract: { type: 'string', shape: 'scalar' } };
}

function variantRule(key) {
  return { ...scalarRule(key), variant_dependent: true };
}

const RULES = {
  sensor: parentRule('sensor'),
  sensor_type: subfieldRule('sensor_type'),
  sensor_date: subfieldRule('sensor_date'),
  switch: parentRule('switch'),
  switch_type: subfieldRule('switch_type'),
  encoder: parentRule('encoder'),
  encoder_steps: subfieldRule('encoder_steps', 'integer'),
  encoder_life_span: subfieldRule('encoder_life_span', 'integer'),
  material: parentRule('material'),
  weight_g: scalarRule('weight_g'),
  release_date: scalarRule('release_date'),
  sku: scalarRule('sku'),
  variant_price: variantRule('variant_price'),
  polling_rate: scalarRule('polling_rate'),
};

const SOURCES = [
  { component_type: 'sensor', roles: { properties: [
    { field_key: 'sensor_type', variance_policy: 'authoritative' },
    { field_key: 'sensor_date', variance_policy: 'authoritative' },
  ] } },
  { component_type: 'switch', roles: { properties: [
    { field_key: 'switch_type', variance_policy: 'authoritative' },
  ] } },
  { component_type: 'encoder', roles: { properties: [
    { field_key: 'encoder_steps', variance_policy: 'upper_bound' },
    { field_key: 'encoder_life_span', variance_policy: 'upper_bound' },
  ] } },
  { component_type: 'material', roles: { properties: [] } },
];

function makeSpecDbStub({ links = [], resolved = {} } = {}) {
  return {
    getItemComponentLinks: () => links,
    getResolvedFieldCandidate: (_pid, fk) =>
      Object.prototype.hasOwnProperty.call(resolved, fk)
        ? { value: resolved[fk], confidence: 90 }
        : null,
  };
}

// ── buildComponentRelationIndex ─────────────────────────────────────────

test('buildComponentRelationIndex: collects parents and subfields (sourced from componentSources)', () => {
  const idx = buildComponentRelationIndex(RULES, SOURCES);
  assert.ok(idx.parentKeys.has('sensor'));
  assert.ok(idx.parentKeys.has('switch'));
  assert.ok(idx.parentKeys.has('encoder'));
  assert.ok(idx.parentKeys.has('material'));
  assert.equal(idx.parentKeys.has('polling_rate'), false);
  assert.equal(idx.parentKeys.has('weight_g'), false);

  assert.equal(idx.subfieldToParent.get('sensor_type'), 'sensor');
  assert.equal(idx.subfieldToParent.get('sensor_date'), 'sensor');
  assert.equal(idx.subfieldToParent.get('switch_type'), 'switch');
  assert.equal(idx.subfieldToParent.get('encoder_steps'), 'encoder');
  assert.equal(idx.subfieldToParent.get('encoder_life_span'), 'encoder');
  assert.equal(idx.subfieldToParent.has('polling_rate'), false);
  assert.equal(idx.subfieldToParent.has('weight_g'), false);
});

test('buildComponentRelationIndex: empty rules → empty sets', () => {
  const idx = buildComponentRelationIndex({}, []);
  assert.equal(idx.parentKeys.size, 0);
  assert.equal(idx.subfieldToParent.size, 0);
});

test('buildComponentRelationIndex: parent with no componentSources entry still counts as parent', () => {
  const idx = buildComponentRelationIndex({ material: parentRule('material') }, []);
  assert.ok(idx.parentKeys.has('material'));
  assert.equal(idx.subfieldToParent.size, 0);
});

test('buildComponentRelationIndex: null rule object is skipped', () => {
  const idx = buildComponentRelationIndex({ missing: null, sensor: RULES.sensor }, SOURCES);
  assert.ok(idx.parentKeys.has('sensor'));
  assert.equal(idx.parentKeys.has('missing'), false);
});

// ── resolveProductComponentInventory ────────────────────────────────────

test('inventory: emits one entry per parent, sorted by parentFieldKey', () => {
  const idx = buildComponentRelationIndex(RULES, SOURCES);
  const specDb = makeSpecDbStub({
    links: [
      { field_key: 'sensor', component_type: 'sensor', component_name: 'Hero 25K' },
      { field_key: 'switch', component_type: 'switch', component_name: 'Omron D2F-01F' },
    ],
    resolved: { sensor_type: 'optical', sensor_date: '2021-04-15' },
  });
  const inv = resolveProductComponentInventory({
    specDb,
    productId: 'p1',
    compiledRulesFields: RULES,
    componentRelationIndex: idx,
  });
  const fks = inv.map((e) => e.parentFieldKey);
  assert.deepEqual(fks, ['encoder', 'material', 'sensor', 'switch']); // sorted asc
});

test('inventory: resolved parent yields identity + product-resolved subfields with variance policy', () => {
  const idx = buildComponentRelationIndex(RULES, SOURCES);
  const specDb = makeSpecDbStub({
    links: [{ field_key: 'sensor', component_type: 'sensor', component_name: 'Hero 25K' }],
    resolved: { sensor_type: 'optical' }, // sensor_date NOT resolved
  });
  const inv = resolveProductComponentInventory({
    specDb, productId: 'p1', compiledRulesFields: RULES, componentRelationIndex: idx,
  });
  const sensor = inv.find((e) => e.parentFieldKey === 'sensor');
  assert.equal(sensor.componentType, 'sensor');
  assert.equal(sensor.resolvedValue, 'Hero 25K');
  // Only sensor_type should appear — sensor_date was not in `resolved`.
  assert.deepEqual(sensor.subfields, [
    { field_key: 'sensor_type', value: 'optical', variancePolicy: 'authoritative' },
  ]);
});

test('inventory: numeric subfield keeps numeric variance policy (upper_bound)', () => {
  const idx = buildComponentRelationIndex(RULES, SOURCES);
  const specDb = makeSpecDbStub({
    links: [{ field_key: 'encoder', component_type: 'encoder', component_name: 'TTC' }],
    resolved: { encoder_steps: 24, encoder_life_span: 5_000_000 },
  });
  const inv = resolveProductComponentInventory({
    specDb, productId: 'p1', compiledRulesFields: RULES, componentRelationIndex: idx,
  });
  const encoder = inv.find((e) => e.parentFieldKey === 'encoder');
  assert.deepEqual(encoder.subfields, [
    { field_key: 'encoder_steps', value: 24, variancePolicy: 'upper_bound' },
    { field_key: 'encoder_life_span', value: 5_000_000, variancePolicy: 'upper_bound' },
  ]);
});

test('inventory: non-numeric subfield collapses upper_bound → authoritative', () => {
  const STRING_SOURCES = [
    { component_type: 'sensor', roles: { properties: [
      { field_key: 'sensor_type', variance_policy: 'upper_bound' }, // non-numeric → collapse
    ] } },
  ];
  const idx = buildComponentRelationIndex(RULES, STRING_SOURCES);
  const specDb = makeSpecDbStub({
    links: [{ field_key: 'sensor', component_type: 'sensor', component_name: 'Hero 25K' }],
    resolved: { sensor_type: 'optical' },
  });
  const inv = resolveProductComponentInventory({
    specDb, productId: 'p1', compiledRulesFields: RULES, componentRelationIndex: idx,
  });
  const sensor = inv.find((e) => e.parentFieldKey === 'sensor');
  assert.deepEqual(sensor.subfields, [
    { field_key: 'sensor_type', value: 'optical', variancePolicy: 'authoritative' },
  ]);
});

test('inventory: unidentified component (no item link) yields empty resolvedValue', () => {
  const idx = buildComponentRelationIndex(RULES, SOURCES);
  const specDb = makeSpecDbStub({ links: [], resolved: {} });
  const inv = resolveProductComponentInventory({
    specDb, productId: 'p1', compiledRulesFields: RULES, componentRelationIndex: idx,
  });
  for (const entry of inv) {
    assert.equal(entry.resolvedValue, '', `${entry.parentFieldKey} should be unidentified`);
    assert.deepEqual(entry.subfields, []);
  }
});

test('inventory: parent with subfields resolved but no identity → subfields still included', () => {
  const idx = buildComponentRelationIndex(RULES, SOURCES);
  const specDb = makeSpecDbStub({
    links: [], // no identity
    resolved: { sensor_type: 'optical' },
  });
  const inv = resolveProductComponentInventory({
    specDb, productId: 'p1', compiledRulesFields: RULES, componentRelationIndex: idx,
  });
  const sensor = inv.find((e) => e.parentFieldKey === 'sensor');
  assert.equal(sensor.resolvedValue, '');
  assert.deepEqual(sensor.subfields, [
    { field_key: 'sensor_type', value: 'optical', variancePolicy: 'authoritative' },
  ]);
});

test('inventory: item-link for non-parent key is ignored', () => {
  const idx = buildComponentRelationIndex(RULES, SOURCES);
  const specDb = makeSpecDbStub({
    links: [{ field_key: 'polling_rate', component_type: 'sensor', component_name: 'Stray' }],
  });
  const inv = resolveProductComponentInventory({
    specDb, productId: 'p1', compiledRulesFields: RULES, componentRelationIndex: idx,
  });
  for (const entry of inv) {
    assert.notEqual(entry.resolvedValue, 'Stray', 'polling_rate is not a parent — link must be ignored');
  }
});

test('inventory: component_name wins over component_maker when both present', () => {
  const idx = buildComponentRelationIndex(
    { sensor: RULES.sensor, sensor_type: RULES.sensor_type },
    SOURCES,
  );
  const specDb = makeSpecDbStub({
    links: [{ field_key: 'sensor', component_type: 'sensor', component_name: 'Hero 25K', component_maker: 'Logitech' }],
  });
  const inv = resolveProductComponentInventory({
    specDb, productId: 'p1',
    compiledRulesFields: { sensor: RULES.sensor, sensor_type: RULES.sensor_type },
    componentRelationIndex: idx,
  });
  const sensor = inv.find((e) => e.parentFieldKey === 'sensor');
  assert.equal(sensor.resolvedValue, 'Hero 25K');
});

// ── resolveKeyComponentRelation ─────────────────────────────────────────

test('relation: parent rule (component non-null) → relation=parent', () => {
  const idx = buildComponentRelationIndex(RULES, SOURCES);
  const rel = resolveKeyComponentRelation({
    fieldKey: 'sensor', fieldRule: RULES.sensor, componentRelationIndex: idx,
  });
  assert.deepEqual(rel, { type: 'sensor', relation: 'parent', parentFieldKey: 'sensor' });
});

test('relation: subfield (listed in a parent property_keys) → relation=subfield_of', () => {
  const idx = buildComponentRelationIndex(RULES, SOURCES);
  const rel = resolveKeyComponentRelation({
    fieldKey: 'sensor_type', fieldRule: RULES.sensor_type, componentRelationIndex: idx,
  });
  assert.deepEqual(rel, { type: 'sensor', relation: 'subfield_of', parentFieldKey: 'sensor' });
});

test('relation: plain scalar with no component relation → null', () => {
  const idx = buildComponentRelationIndex(RULES, SOURCES);
  const rel = resolveKeyComponentRelation({
    fieldKey: 'polling_rate', fieldRule: RULES.polling_rate, componentRelationIndex: idx,
  });
  assert.equal(rel, null);
});

test('relation: fieldKey unknown to index → null', () => {
  const idx = buildComponentRelationIndex(RULES, SOURCES);
  const rel = resolveKeyComponentRelation({
    fieldKey: 'made_up_field', fieldRule: { field_key: 'made_up_field', component: null }, componentRelationIndex: idx,
  });
  assert.equal(rel, null);
});

// ── readKnownFieldsByProduct ────────────────────────────────────────────

test('knownFields: empty product → empty dict', () => {
  const specDb = makeSpecDbStub({ resolved: {} });
  const out = readKnownFieldsByProduct({
    specDb, productId: 'p1', compiledRulesFields: RULES, excludeFieldKeys: new Set(),
  });
  assert.deepEqual(out, {});
});

test('knownFields: collects every resolved field, passes value through as-is', () => {
  const specDb = makeSpecDbStub({
    resolved: { polling_rate: 8000, weight_g: 63, release_date: '2023-09-15' },
  });
  const out = readKnownFieldsByProduct({
    specDb, productId: 'p1', compiledRulesFields: RULES, excludeFieldKeys: new Set(),
  });
  assert.deepEqual(out, { polling_rate: 8000, weight_g: 63, release_date: '2023-09-15' });
});

test('knownFields: excludeFieldKeys set suppresses matching keys', () => {
  const specDb = makeSpecDbStub({
    resolved: { polling_rate: 8000, weight_g: 63, release_date: '2023-09-15' },
  });
  const out = readKnownFieldsByProduct({
    specDb, productId: 'p1',
    compiledRulesFields: RULES,
    excludeFieldKeys: new Set(['polling_rate', 'release_date']),
  });
  assert.deepEqual(out, { weight_g: 63 });
});

test('knownFields: non-Set exclude argument treated as empty (defensive)', () => {
  const specDb = makeSpecDbStub({ resolved: { polling_rate: 8000 } });
  const out = readKnownFieldsByProduct({
    specDb, productId: 'p1', compiledRulesFields: RULES, excludeFieldKeys: undefined,
  });
  assert.deepEqual(out, { polling_rate: 8000 });
});

test('knownFields: null-valued resolved reads skipped (null is not "resolved")', () => {
  const specDb = {
    getResolvedFieldCandidate: (_pid, fk) => (fk === 'polling_rate' ? { value: null, confidence: 50 } : null),
  };
  const out = readKnownFieldsByProduct({
    specDb, productId: 'p1', compiledRulesFields: RULES, excludeFieldKeys: new Set(),
  });
  assert.deepEqual(out, {});
});

// -- readProductScopedFactsByProduct ---------------------------------------

test('productScopedFacts: excludes reserved identity keys and variant-dependent fields', () => {
  const calls = [];
  const specDb = {
    getFieldCandidatesByProductAndField: (_pid, fk, variantId) => {
      calls.push({ fk, variantId });
      const rows = {
        weight_g: [{ field_key: 'weight_g', value: 63, status: 'resolved', confidence: 90, variant_id: null }],
        release_date: [{ field_key: 'release_date', value: '2025-11-11', status: 'resolved', confidence: 99, variant_id: 'v_bo7' }],
        sku: [{ field_key: 'sku', value: 'CH-931DB1M-NA', status: 'resolved', confidence: 99, variant_id: 'v_bo7' }],
        variant_price: [{ field_key: 'variant_price', value: '$179', status: 'resolved', confidence: 91, variant_id: 'v_bo7' }],
      };
      return (rows[fk] || []).filter((row) => (row.variant_id ?? null) === (variantId ?? null));
    },
    getResolvedFieldCandidate: () => {
      throw new Error('product-scoped reader must not use variant-blind resolved lookup when scoped rows are available');
    },
  };

  const out = readProductScopedFactsByProduct({
    specDb,
    productId: 'p1',
    compiledRulesFields: RULES,
    excludeFieldKeys: new Set(['polling_rate']),
  });

  assert.deepEqual(out, { weight_g: 63 });
  assert.equal(calls.some((call) => call.fk === 'release_date'), false, 'reserved RDF key must not be queried');
  assert.equal(calls.some((call) => call.fk === 'sku'), false, 'reserved SKF key must not be queried');
  assert.equal(calls.some((call) => call.fk === 'variant_price'), false, 'variant-dependent field must not be queried');
});

test('productScopedFacts: falls back to legacy resolved lookup only when scoped candidate API is absent', () => {
  const specDb = makeSpecDbStub({ resolved: { weight_g: 63, polling_rate: 4000 } });
  const out = readProductScopedFactsByProduct({
    specDb,
    productId: 'p1',
    compiledRulesFields: RULES,
    excludeFieldKeys: new Set(['polling_rate']),
  });

  assert.deepEqual(out, { weight_g: 63 });
});

// -- resolveVariantInventory ------------------------------------------------

test('variantInventory: active SQL variants join resolved SKU and release_date by variant_id', () => {
  const specDb = {
    variants: {
      listActive: () => [
        {
          variant_id: 'v_black',
          variant_key: 'color:black',
          variant_type: 'color',
          variant_label: 'black',
          color_atoms: ['black'],
        },
        {
          variant_id: 'v_bo7',
          variant_key: 'edition:call-of-duty-black-ops-7-edition',
          variant_type: 'edition',
          variant_label: 'Call of Duty: Black Ops 7 Edition',
          color_atoms: ['black', 'white', 'dark-blue', 'orange'],
        },
      ],
    },
    getFieldCandidatesByProductAndField: (_pid, fieldKey, variantId) => {
      const rows = {
        sku: [
          { field_key: 'sku', value: 'BLACK-SHOULD-NOT-LEAK', status: 'resolved', confidence: 99, variant_id: 'v_black' },
          { field_key: 'sku', value: 'CH-931DB1M-NA', status: 'resolved', confidence: 96, variant_id: 'v_bo7' },
        ],
        release_date: [
          { field_key: 'release_date', value: '2025-11-11', status: 'resolved', confidence: 95, variant_id: 'v_bo7' },
        ],
      };
      return (rows[fieldKey] || []).filter((row) => row.variant_id === variantId);
    },
    listPifVariantProgressByProduct: () => [
      { variant_id: 'v_bo7', hero_filled: 1, hero_target: 3, priority_filled: 2, priority_total: 4 },
    ],
  };

  const inventory = resolveVariantInventory({
    specDb,
    productId: 'p1',
    fieldRule: scalarRule('design'),
  });

  assert.equal(inventory.length, 2);
  assert.deepEqual(inventory[0], {
    variant_id: 'v_black',
    variant_key: 'color:black',
    label: 'black',
    type: 'color',
    color_atoms: ['black'],
    sku: 'BLACK-SHOULD-NOT-LEAK',
    release_date: '',
    image_status: '',
  });
  assert.deepEqual(inventory[1], {
    variant_id: 'v_bo7',
    variant_key: 'edition:call-of-duty-black-ops-7-edition',
    label: 'Call of Duty: Black Ops 7 Edition',
    type: 'edition',
    color_atoms: ['black', 'white', 'dark-blue', 'orange'],
    sku: 'CH-931DB1M-NA',
    release_date: '2025-11-11',
    image_status: 'hero 1/3; priority 2/4',
  });
});

test('variantInventory: omitted for a single non-discriminating default variant with no joined facts', () => {
  const specDb = {
    variants: {
      listActive: () => [{ variant_id: 'v0', variant_key: 'default', variant_type: 'base', variant_label: 'Default', color_atoms: [] }],
    },
    getFieldCandidatesByProductAndField: () => [],
    listPifVariantProgressByProduct: () => [],
  };

  const inventory = resolveVariantInventory({ specDb, productId: 'p1', fieldRule: scalarRule('polling_rate') });

  assert.deepEqual(inventory, []);
});

test('variantInventory: field-rule disabled flag suppresses inventory even when active variants exist', () => {
  const specDb = {
    variants: {
      listActive: () => [{ variant_id: 'v_black', variant_key: 'color:black', variant_type: 'color', variant_label: 'black', color_atoms: ['black'] }],
    },
    getFieldCandidatesByProductAndField: () => [],
  };

  const inventory = resolveVariantInventory({
    specDb,
    productId: 'p1',
    fieldRule: {
      ...scalarRule('polling_rate'),
      ai_assist: { variant_inventory_usage: { enabled: false } },
    },
  });

  assert.deepEqual(inventory, []);
});

test('variantInventory: legacy off mode still suppresses inventory', () => {
  const specDb = {
    variants: {
      listActive: () => [{ variant_id: 'v_black', variant_key: 'color:black', variant_type: 'color', variant_label: 'black', color_atoms: ['black'] }],
    },
    getFieldCandidatesByProductAndField: () => [],
  };

  const inventory = resolveVariantInventory({
    specDb,
    productId: 'p1',
    fieldRule: {
      ...scalarRule('polling_rate'),
      ai_assist: { variant_inventory_usage: { mode: 'off' } },
    },
  });

  assert.deepEqual(inventory, []);
});

// -- buildFieldIdentityUsage ------------------------------------------------

test('fieldIdentityUsage: design key separates base design from edition artwork without profile knob', () => {
  const usage = buildFieldIdentityUsage({
    fieldKey: 'design',
    fieldRule: scalarRule('design'),
  });

  assert.match(usage, /When researching `design`:/);
  assert.match(usage, /shared physical\/industrial design/i);
  assert.match(usage, /edition artwork, colorway, franchise branding/i);
  assert.match(usage, /Never output colors, editions, sku, or release_date/i);
});

test('fieldIdentityUsage: authored field guidance prevents derived semantic profile text', () => {
  const usage = buildFieldIdentityUsage({
    fieldKey: 'design',
    fieldRule: {
      ...scalarRule('design'),
      ai_assist: {
        reasoning_note: 'Classify edition-design status as standard, limited edition, collaboration, or multiple.',
      },
    },
  });

  assert.match(usage, /When researching `design`:/);
  assert.match(usage, /Follow the authored field guidance/i);
  assert.match(usage, /confirm exact product\/variant identity/i);
  assert.doesNotMatch(usage, /shared physical\/industrial design/i);
  assert.doesNotMatch(usage, /Never output colors, editions, sku, or release_date/i);
});

test('fieldIdentityUsage: disabled variant inventory flag omits usage guidance', () => {
  const usage = buildFieldIdentityUsage({
    fieldKey: 'polling_rate',
    fieldRule: {
      ...scalarRule('polling_rate'),
      ai_assist: { variant_inventory_usage: { enabled: false } },
    },
  });

  assert.equal(usage, '');
});

test('fieldIdentityUsage: legacy text/profile metadata is ignored because guidance belongs in reasoning_note', () => {
  const usage = buildFieldIdentityUsage({
    fieldKey: 'polling_rate',
    fieldRule: {
      ...scalarRule('polling_rate'),
      ai_assist: {
        variant_inventory_usage: {
          mode: 'override',
          profile: 'visual_design',
          text: 'Only use explicit polling-rate rows.',
        },
      },
    },
  });

  assert.match(usage, /Use VARIANT_INVENTORY as a source-identity filter/);
  assert.doesNotMatch(usage, /Only use explicit polling-rate rows/);
  assert.doesNotMatch(usage, /shared physical\/industrial design/i);
});

test('runtimeContext: returns productScopedFacts, variantInventory, and fieldIdentityUsage together', () => {
  const specDb = {
    variants: {
      listActive: () => [{ variant_id: 'v_white', variant_key: 'color:white', variant_type: 'color', variant_label: 'white', color_atoms: ['white'] }],
    },
    getFieldCandidatesByProductAndField: (_pid, fk, variantId) => {
      if (fk === 'weight_g' && variantId === null) {
        return [{ field_key: 'weight_g', value: 63, status: 'resolved', confidence: 90, variant_id: null }];
      }
      return [];
    },
    listPifVariantProgressByProduct: () => [],
  };

  const ctx = resolveKeyFinderRuntimeContext({
    specDb,
    productId: 'p1',
    compiledRulesFields: RULES,
    excludeFieldKeys: new Set(['polling_rate']),
    primaryFieldKey: 'polling_rate',
    primaryFieldRule: scalarRule('polling_rate'),
  });

  assert.deepEqual(ctx.productScopedFacts, { weight_g: 63 });
  assert.equal(ctx.variantInventory.length, 1);
  assert.match(ctx.fieldIdentityUsage, /When researching `polling_rate`:/);
});
