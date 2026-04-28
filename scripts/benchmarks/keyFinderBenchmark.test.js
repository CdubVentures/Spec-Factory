import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildBenchmark,
  buildPublishedValueMap,
  compareBenchmark,
  htmlReport,
  normalizeForCompare,
} from './keyFinderBenchmark.js';

const fieldRules = {
  fields: {
    weight: {
      field_key: 'weight',
      contract: { type: 'number', shape: 'scalar', unit: 'g', rounding: { decimals: 1 } },
      ui: { label: 'Weight', group: 'Build & Materials', order: 24, suffix: 'g' },
    },
    connectivity: {
      field_key: 'connectivity',
      contract: { type: 'string', shape: 'list' },
      ui: { label: 'Connectivity', group: 'Connectivity & Power', order: 11 },
    },
    rgb: {
      field_key: 'rgb',
      contract: { type: 'boolean', shape: 'scalar' },
      ui: { label: 'RGB', group: 'Appearance', order: 9 },
    },
    sensor_date: {
      field_key: 'sensor_date',
      contract: { type: 'date', shape: 'scalar' },
      ui: { label: 'Sensor Date', group: 'Sensor Identity', order: 38 },
    },
  },
};

const workbookMap = {
  product_table: {
    sheet: 'dataEntry',
    key_column: 'B',
    value_col_start: 'C',
    brand_row: 3,
    model_row: 4,
    variant_row: 5,
    data_row_start: 9,
  },
  key_list: {
    column: 'B',
    row_start: 9,
    row_end: 12,
    sheet: 'dataEntry',
  },
};

const rows = [
  [],
  [],
  ['', '', 'Corsair', 'Razer', ''],
  ['', '', 'M75 Air Wireless', 'Viper V3 Pro', 'Blank Product'],
  ['', '', 'Air Wireless', 'Pro', ''],
  [],
  [],
  [],
  ['', 'weight', '60 g', '54', ''],
  ['', 'connectivity', 'USB Wired, 2.4GHz RF Dongle', '2.4GHz RF Dongle', ''],
  ['', 'rgb', 'no', 'yes', ''],
  ['', 'sensor_date', '2023-09-01', 'Sep 2024', ''],
];

describe('key finder benchmark contract', () => {
  it('extracts only completed workbook candidates and keeps field metadata', () => {
    const benchmark = buildBenchmark({ rows, fieldRules, workbookMap, category: 'mouse' });

    assert.equal(benchmark.category, 'mouse');
    assert.equal(benchmark.products.length, 2);
    assert.deepEqual(
      benchmark.products.map((product) => product.display_name),
      ['Corsair M75 Air Wireless Air Wireless', 'Razer Viper V3 Pro Pro'],
    );
    assert.deepEqual(benchmark.products[0].fields.weight, {
      raw: '60 g',
      normalized: 60,
      label: 'Weight',
      group: 'Build & Materials',
      type: 'number',
      shape: 'scalar',
      unit: 'g',
    });
    assert.deepEqual(benchmark.field_keys, ['weight', 'connectivity', 'rgb', 'sensor_date']);
  });

  it('does not treat a base_model identity row as a product variant', () => {
    const baseModelRows = rows.map((row) => [...row]);
    baseModelRows[4][1] = 'base_model';

    const benchmark = buildBenchmark({ rows: baseModelRows, fieldRules, workbookMap, category: 'mouse' });

    assert.equal(benchmark.products[0].display_name, 'Corsair M75 Air Wireless');
    assert.equal(benchmark.products[0].variant, '');
    assert.equal(benchmark.products[0].base_model, 'Air Wireless');
  });

  it('normalizes common scalar, list, boolean, and date values for comparison', () => {
    assert.deepEqual(normalizeForCompare('60 g', { type: 'number', shape: 'scalar' }), 60);
    assert.deepEqual(normalizeForCompare('USB Wired, 2.4GHz RF Dongle', { type: 'string', shape: 'list' }), [
      '2.4ghz rf dongle',
      'usb wired',
    ]);
    assert.equal(normalizeForCompare('yes', { type: 'boolean', shape: 'scalar' }), true);
    assert.equal(normalizeForCompare('Sep 2024', { type: 'date', shape: 'scalar' }), '2024-09');
  });

  it('uses highest-confidence resolved product-scoped DB row per product and field', () => {
    const rowsFromDb = [
      { product_id: 'p1', field_key: 'weight', value: '59', confidence: 80, status: 'resolved', variant_id: null },
      { product_id: 'p1', field_key: 'weight', value: '60', confidence: 95, status: 'resolved', variant_id: null },
      { product_id: 'p1', field_key: 'rgb', value: 'yes', confidence: 99, status: 'candidate', variant_id: null },
      { product_id: 'p1', field_key: 'connectivity', value: '["2.4GHz RF Dongle","USB Wired"]', confidence: 90, status: 'resolved', variant_id: null },
      { product_id: 'p1', field_key: 'sensor_date', value: '2024-09-01', confidence: 99, status: 'resolved', variant_id: 'v_black' },
    ];

    const map = buildPublishedValueMap(rowsFromDb);

    assert.equal(map.get('p1')?.get('weight')?.value, '60');
    assert.equal(map.get('p1')?.get('rgb'), undefined);
    assert.deepEqual(map.get('p1')?.get('connectivity')?.normalized, ['2.4ghz rf dongle', 'usb wired']);
    assert.equal(map.get('p1')?.get('sensor_date'), undefined);
  });

  it('scores correct, wrong, missing, extra, and needs-review cells', () => {
    const benchmark = buildBenchmark({ rows, fieldRules, workbookMap, category: 'mouse' });
    const products = [
      { product_id: 'p1', brand: 'Corsair', model: 'M75 Air Wireless', variant: 'Air Wireless' },
      { product_id: 'p2', brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    ];
    const published = buildPublishedValueMap([
      { product_id: 'p1', field_key: 'weight', value: '60.0', confidence: 99, status: 'resolved', variant_id: null },
      { product_id: 'p1', field_key: 'connectivity', value: '["2.4GHz RF Dongle","USB Wired"]', confidence: 90, status: 'resolved', variant_id: null },
      { product_id: 'p1', field_key: 'rgb', value: 'yes', confidence: 91, status: 'resolved', variant_id: null },
      { product_id: 'p2', field_key: 'weight', value: '57', confidence: 91, status: 'resolved', variant_id: null },
      { product_id: 'p2', field_key: 'connectivity', value: '2.4GHz Dongle', confidence: 91, status: 'resolved', variant_id: null },
      { product_id: 'p2', field_key: 'rgb', value: 'yes', confidence: 99, status: 'resolved', variant_id: null },
      { product_id: 'p2', field_key: 'sensor_date', value: '2024-09', confidence: 90, status: 'resolved', variant_id: null },
    ]);

    const scorecard = compareBenchmark({ benchmark, products, published });

    assert.equal(scorecard.summary.correct, 4);
    assert.equal(scorecard.summary.wrong, 2);
    assert.equal(scorecard.summary.missing, 1);
    assert.equal(scorecard.summary.needs_review, 1);
    assert.equal(scorecard.summary.scored, 8);
    assert.equal(scorecard.summary.accuracy, 50);
    assert.equal(scorecard.products[0].cells.rgb.status, 'wrong');
    assert.equal(scorecard.products[1].cells.connectivity.status, 'needs_review');
  });

  it('renders readable candidate and scorecard HTML', () => {
    const benchmark = buildBenchmark({ rows, fieldRules, workbookMap, category: 'mouse' });
    const scorecard = compareBenchmark({
      benchmark,
      products: [{ product_id: 'p1', brand: 'Corsair', model: 'M75 Air Wireless', variant: 'Air Wireless' }],
      published: buildPublishedValueMap([
        { product_id: 'p1', field_key: 'weight', value: '60', confidence: 99, status: 'resolved', variant_id: null },
      ]),
    });

    const candidatesHtml = htmlReport({ title: 'Benchmark Candidates', benchmark });
    const scorecardHtml = htmlReport({ title: 'Scorecard', benchmark, scorecard });

    assert.match(candidatesHtml, /Benchmark Candidates/);
    assert.match(candidatesHtml, /Corsair M75 Air Wireless/);
    assert.match(scorecardHtml, /Scorecard/);
    assert.match(scorecardHtml, /Accuracy/);
    assert.match(scorecardHtml, /Missing/);
  });
});
