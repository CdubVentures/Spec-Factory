import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBaseValues } from '../testDataProvider.js';

// --- Minimal contract analysis fixture ---
function buildContractAnalysis({ fieldOverrides = {}, componentItems = {} } = {}) {
  const fields = {
    weight: { contract: { type: 'number', shape: 'scalar' }, parse: { template: 'number_with_unit' }, enum: {} },
    dpi: { contract: { type: 'number', shape: 'scalar' }, parse: { template: 'number_with_unit' }, enum: {} },
    sensor: { contract: { type: 'string', shape: 'scalar' }, parse: { template: 'component_reference' }, enum: { source: 'component_db.sensors.items.name' } },
    connection: { contract: { type: 'string', shape: 'scalar' }, parse: { template: 'text_field' }, enum: { source: 'data_lists.connection' } },
    bluetooth: { contract: { type: 'string', shape: 'scalar' }, parse: { template: 'boolean_yes_no_unk' }, enum: {} },
    release_date: { contract: { type: 'string', shape: 'scalar' }, parse: { template: 'date_field' }, enum: {} },
    product_url: { contract: { type: 'string', shape: 'scalar' }, parse: { template: 'url_field' }, enum: {} },
    colors: { contract: { type: 'string', shape: 'list' }, parse: {}, enum: {} },
    ...fieldOverrides,
  };
  const fieldKeys = Object.keys(fields);
  const sensorItems = componentItems.sensors || [
    { name: 'Sensor Alpha 01', maker: 'BrandA', __nonDiscovered: false, __discovery_source: 'pipeline' },
    { name: 'Sensor Beta 02', maker: 'BrandB', __nonDiscovered: false, __discovery_source: 'pipeline' },
    { name: 'Sensor Gamma 03', maker: '', __nonDiscovered: false, __discovery_source: 'pipeline' },
  ];
  return {
    summary: { rangeConstraints: {} },
    _raw: {
      fields,
      fieldKeys,
      componentTypes: [{ type: 'sensor', dbFile: 'sensors', itemCount: sensorItems.length }],
      componentDBs: { sensors: { items: sensorItems, component_type: 'sensor' } },
      kvFields: { connection: ['wired', 'wireless', 'hybrid', 'bluetooth'] },
      listFields: ['colors'],
      knownValuesCatalogs: [{ field: 'connection', policy: 'open_prefer_known' }],
      preserveAllFields: [],
      tierOverrideFields: [],
      rules: [],
    },
  };
}

test('buildBaseValues — returns a value for every fieldKey', () => {
  const analysis = buildContractAnalysis();
  const values = buildBaseValues(analysis, 0);
  for (const key of analysis._raw.fieldKeys) {
    assert.ok(key in values, `missing value for field: ${key}`);
    assert.ok(String(values[key]).trim().length > 0, `empty value for field: ${key}`);
  }
});

test('buildBaseValues — numeric fields produce string representations of numbers', () => {
  const analysis = buildContractAnalysis();
  const values = buildBaseValues(analysis, 0);
  const num = Number(values.weight);
  assert.ok(Number.isFinite(num), `weight should be numeric, got: ${values.weight}`);
  assert.ok(num > 0, `weight should be positive, got: ${num}`);

  const dpiNum = Number(values.dpi);
  assert.ok(Number.isFinite(dpiNum), `dpi should be numeric, got: ${values.dpi}`);
  assert.ok(dpiNum > 0, `dpi should be positive, got: ${dpiNum}`);
});

test('buildBaseValues — boolean fields produce "yes"', () => {
  const analysis = buildContractAnalysis();
  const values = buildBaseValues(analysis, 0);
  assert.equal(values.bluetooth, 'yes');
});

test('buildBaseValues — date fields produce a date string', () => {
  const analysis = buildContractAnalysis();
  const values = buildBaseValues(analysis, 0);
  assert.ok(values.release_date.match(/^\d{4}-\d{2}-\d{2}$/), `date should be YYYY-MM-DD, got: ${values.release_date}`);
});

test('buildBaseValues — url fields produce a URL', () => {
  const analysis = buildContractAnalysis();
  const values = buildBaseValues(analysis, 0);
  assert.ok(values.product_url.startsWith('http'), `url should start with http, got: ${values.product_url}`);
});

test('buildBaseValues — enum from data_lists uses known value catalog', () => {
  const analysis = buildContractAnalysis();
  const values = buildBaseValues(analysis, 0);
  const valid = ['wired', 'wireless', 'hybrid', 'bluetooth'];
  assert.ok(valid.includes(values.connection), `connection should be from catalog, got: ${values.connection}`);
});

test('buildBaseValues — component_reference fields use component DB names', () => {
  const analysis = buildContractAnalysis();
  const values = buildBaseValues(analysis, 0);
  assert.ok(values.sensor, 'sensor should have a value');
  const validNames = ['Sensor Alpha 01', 'Sensor Beta 02', 'Sensor Gamma 03'];
  assert.ok(validNames.includes(values.sensor), `sensor should be from component DB, got: ${values.sensor}`);
});

test('buildBaseValues — list fields produce comma-separated values', () => {
  const analysis = buildContractAnalysis();
  const values = buildBaseValues(analysis, 0);
  assert.ok(values.colors.includes(','), `list field should have commas, got: ${values.colors}`);
});

test('buildBaseValues — different scenarioIdx produces different numeric values', () => {
  const analysis = buildContractAnalysis();
  const v0 = buildBaseValues(analysis, 0);
  const v1 = buildBaseValues(analysis, 1);
  // At least one numeric field should differ between scenarios
  const w0 = Number(v0.weight);
  const w1 = Number(v1.weight);
  assert.notEqual(w0, w1, 'different scenarios should produce different numeric values');
});
