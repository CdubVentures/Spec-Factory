/**
 * productResolvedStateReader — unit tests (pure helpers, stubbed specDb).
 *
 * Covers the four exports:
 *   buildComponentRelationIndex
 *   resolveProductComponentInventory
 *   resolveKeyComponentRelation
 *   readKnownFieldsByProduct
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComponentRelationIndex,
  resolveProductComponentInventory,
  resolveKeyComponentRelation,
  readKnownFieldsByProduct,
} from '../productResolvedStateReader.js';

// ── Fixtures ────────────────────────────────────────────────────────────

// Parent-component rule shape mirrors mouse/_generated/field_rules.json
// (trimmed to the fields the reader actually reads).
function parentRule(type, propertyKeys) {
  return {
    field_key: type,
    component: {
      type,
      match: { property_keys: propertyKeys },
      source: `component_db.${type}`,
    },
    contract: { type: 'string', shape: 'scalar' },
    group: type,
  };
}

function subfieldRule(key) {
  return { field_key: key, component: null, contract: { type: 'string', shape: 'scalar' } };
}

function scalarRule(key) {
  return { field_key: key, component: null, contract: { type: 'string', shape: 'scalar' } };
}

const RULES = {
  sensor: parentRule('sensor', ['sensor_type', 'sensor_date']),
  sensor_type: subfieldRule('sensor_type'),
  sensor_date: subfieldRule('sensor_date'),
  switch: parentRule('switch', ['switch_type']),
  switch_type: subfieldRule('switch_type'),
  encoder: parentRule('encoder', ['encoder_steps', 'encoder_life_span']),
  encoder_steps: subfieldRule('encoder_steps'),
  encoder_life_span: subfieldRule('encoder_life_span'),
  material: parentRule('material', []), // parent with no declared property_keys
  weight_g: scalarRule('weight_g'),
  release_date: scalarRule('release_date'),
  polling_rate: scalarRule('polling_rate'),
};

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

test('buildComponentRelationIndex: collects parents and subfields', () => {
  const idx = buildComponentRelationIndex(RULES);
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
  const idx = buildComponentRelationIndex({});
  assert.equal(idx.parentKeys.size, 0);
  assert.equal(idx.subfieldToParent.size, 0);
});

test('buildComponentRelationIndex: parent with no property_keys still counts as parent', () => {
  const idx = buildComponentRelationIndex({ material: parentRule('material', []) });
  assert.ok(idx.parentKeys.has('material'));
  assert.equal(idx.subfieldToParent.size, 0);
});

test('buildComponentRelationIndex: null rule object is skipped', () => {
  const idx = buildComponentRelationIndex({ missing: null, sensor: RULES.sensor });
  assert.ok(idx.parentKeys.has('sensor'));
  assert.equal(idx.parentKeys.has('missing'), false);
});

// ── resolveProductComponentInventory ────────────────────────────────────

test('inventory: emits one entry per parent, sorted by parentFieldKey', () => {
  const idx = buildComponentRelationIndex(RULES);
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

test('inventory: resolved parent yields identity + product-resolved subfields only', () => {
  const idx = buildComponentRelationIndex(RULES);
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
  assert.deepEqual(sensor.subfields, [{ field_key: 'sensor_type', value: 'optical' }]);
});

test('inventory: unidentified component (no item link) yields empty resolvedValue', () => {
  const idx = buildComponentRelationIndex(RULES);
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
  const idx = buildComponentRelationIndex(RULES);
  const specDb = makeSpecDbStub({
    links: [], // no identity
    resolved: { sensor_type: 'optical' },
  });
  const inv = resolveProductComponentInventory({
    specDb, productId: 'p1', compiledRulesFields: RULES, componentRelationIndex: idx,
  });
  const sensor = inv.find((e) => e.parentFieldKey === 'sensor');
  assert.equal(sensor.resolvedValue, '');
  assert.deepEqual(sensor.subfields, [{ field_key: 'sensor_type', value: 'optical' }]);
});

test('inventory: item-link for non-parent key is ignored', () => {
  const idx = buildComponentRelationIndex(RULES);
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
  const idx = buildComponentRelationIndex({ sensor: RULES.sensor, sensor_type: RULES.sensor_type });
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
  const idx = buildComponentRelationIndex(RULES);
  const rel = resolveKeyComponentRelation({
    fieldKey: 'sensor', fieldRule: RULES.sensor, componentRelationIndex: idx,
  });
  assert.deepEqual(rel, { type: 'sensor', relation: 'parent', parentFieldKey: 'sensor' });
});

test('relation: subfield (listed in a parent property_keys) → relation=subfield_of', () => {
  const idx = buildComponentRelationIndex(RULES);
  const rel = resolveKeyComponentRelation({
    fieldKey: 'sensor_type', fieldRule: RULES.sensor_type, componentRelationIndex: idx,
  });
  assert.deepEqual(rel, { type: 'sensor', relation: 'subfield_of', parentFieldKey: 'sensor' });
});

test('relation: plain scalar with no component relation → null', () => {
  const idx = buildComponentRelationIndex(RULES);
  const rel = resolveKeyComponentRelation({
    fieldKey: 'polling_rate', fieldRule: RULES.polling_rate, componentRelationIndex: idx,
  });
  assert.equal(rel, null);
});

test('relation: fieldKey unknown to index → null', () => {
  const idx = buildComponentRelationIndex(RULES);
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
