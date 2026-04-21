/**
 * keyFinderGroupedRows selector — pure function tests.
 *
 * BEHAVIORAL class: state transitions + filter logic + grouping invariants.
 * UI component rendering is NOT tested (per feedback_prompt_test_looseness).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectKeyFinderGroupedRows } from '../keyFinderGroupedRows.ts';
import { DEFAULT_FILTERS } from '../../types.ts';
import type { ReviewLayoutRow } from '../../../../types/review.ts';
import type { KeyFinderSummaryRow } from '../../types.ts';

function layoutRow(
  key: string,
  group: string,
  label?: string,
  variantDependent = false,
): ReviewLayoutRow {
  return {
    group,
    key,
    label: label || key,
    field_rule: {
      type: 'string',
      required: false,
      units: null,
      enum_name: null,
      component_type: null,
      enum_source: null,
      variant_dependent: variantDependent,
    },
  };
}

function sumRow(
  field_key: string,
  overrides: Partial<KeyFinderSummaryRow> = {},
): KeyFinderSummaryRow {
  return {
    field_key,
    group: '',
    label: field_key,
    difficulty: 'medium',
    availability: 'always',
    required_level: 'mandatory',
    variant_dependent: false,
    budget: 5,
    last_run_number: null,
    last_ran_at: null,
    last_status: null,
    last_value: null,
    last_confidence: null,
    last_model: null,
    candidate_count: 0,
    published: false,
    run_count: 0,
    ...overrides,
  };
}

describe('selectKeyFinderGroupedRows', () => {
  it('drops variant_dependent rows', () => {
    const result = selectKeyFinderGroupedRows({
      layout: [
        layoutRow('polling_rate', 'sensor_performance'),
        layoutRow('body_color', 'appearance', 'Body Color', true),
      ],
      summary: [sumRow('polling_rate'), sumRow('body_color')],
      reserved: new Set(),
      runningSet: new Set(),
      filters: DEFAULT_FILTERS,
    });
    assert.equal(result.totals.eligible, 1);
    assert.equal(result.totals.excluded, 1);
    const allKeys = result.groups.flatMap((g) => g.keys.map((k) => k.field_key));
    assert.ok(allKeys.includes('polling_rate'));
    assert.ok(!allKeys.includes('body_color'));
  });

  it('drops reserved field keys', () => {
    const result = selectKeyFinderGroupedRows({
      layout: [
        layoutRow('polling_rate', 'sensor_performance'),
        layoutRow('colors', 'identity'),
        layoutRow('release_date', 'identity'),
        layoutRow('sku', 'identity'),
      ],
      summary: [sumRow('polling_rate')],
      reserved: ['colors', 'editions', 'release_date', 'sku'],
      runningSet: new Set(),
      filters: DEFAULT_FILTERS,
    });
    assert.equal(result.totals.eligible, 1);
    assert.equal(result.totals.excluded, 3);
    const names = result.groups.map((g) => g.name);
    assert.deepEqual(names, ['sensor_performance'], 'empty identity group dropped');
  });

  it('preserves Field Studio order within each group', () => {
    const result = selectKeyFinderGroupedRows({
      layout: [
        layoutRow('sensor_model', 'sensor_performance'),   // 1st in group
        layoutRow('wireless_technology', 'connectivity'),
        layoutRow('polling_rate', 'sensor_performance'),   // 2nd in group
        layoutRow('battery_hours', 'connectivity'),
      ],
      summary: [
        sumRow('sensor_model'), sumRow('wireless_technology'),
        sumRow('polling_rate'), sumRow('battery_hours'),
      ],
      reserved: new Set(),
      runningSet: new Set(),
      filters: DEFAULT_FILTERS,
    });
    // Group order: sensor_performance first (layout row 0), connectivity second (layout row 1)
    assert.deepEqual(result.groups.map((g) => g.name), ['sensor_performance', 'connectivity']);
    assert.deepEqual(
      result.groups[0].keys.map((k) => k.field_key),
      ['sensor_model', 'polling_rate'],
      'sensor_performance keys in layout order',
    );
    assert.deepEqual(
      result.groups[1].keys.map((k) => k.field_key),
      ['wireless_technology', 'battery_hours'],
    );
  });

  it('narrows by required=mandatory + status=unresolved', () => {
    const result = selectKeyFinderGroupedRows({
      layout: [
        layoutRow('a', 'g1'),
        layoutRow('b', 'g1'),
        layoutRow('c', 'g1'),
      ],
      summary: [
        sumRow('a', { required_level: 'mandatory', last_status: 'unresolved', run_count: 1 }),
        sumRow('b', { required_level: 'non_mandatory', last_status: 'unresolved', run_count: 1 }),
        sumRow('c', { required_level: 'mandatory', last_status: 'resolved', run_count: 1, published: true }),
      ],
      reserved: new Set(),
      runningSet: new Set(),
      filters: { ...DEFAULT_FILTERS, required: 'mandatory', status: 'unresolved' },
    });
    const keys = result.groups.flatMap((g) => g.keys.map((k) => k.field_key));
    assert.deepEqual(keys, ['a'], 'only mandatory+unresolved row survives');
  });

  it('runningSet overrides status to null and counts running', () => {
    const result = selectKeyFinderGroupedRows({
      layout: [layoutRow('x', 'g1'), layoutRow('y', 'g1')],
      summary: [
        sumRow('x', { last_status: 'resolved', run_count: 1 }),
        sumRow('y', { last_status: 'unresolved' }),
      ],
      reserved: new Set(),
      runningSet: new Set(['x']),
      filters: DEFAULT_FILTERS,
    });
    const x = result.groups[0].keys.find((k) => k.field_key === 'x')!;
    assert.equal(x.running, true);
    assert.equal(x.last_status, null, 'running overrides last_status');
    assert.equal(result.totals.running, 1);
    assert.equal(result.groups[0].stats.running, 1);
  });

  it('status filter uses "running" as a matchable value', () => {
    const result = selectKeyFinderGroupedRows({
      layout: [layoutRow('x', 'g1'), layoutRow('y', 'g1')],
      summary: [sumRow('x'), sumRow('y', { last_status: 'resolved' })],
      reserved: new Set(),
      runningSet: new Set(['x']),
      filters: { ...DEFAULT_FILTERS, status: 'running' },
    });
    const keys = result.groups.flatMap((g) => g.keys.map((k) => k.field_key));
    assert.deepEqual(keys, ['x']);
  });

  it('search filter matches substring of field_key / label / group', () => {
    const result = selectKeyFinderGroupedRows({
      layout: [
        layoutRow('sensor_model', 'sensor_performance'),
        layoutRow('battery_hours', 'connectivity', 'Battery Hours'),
        layoutRow('polling_rate', 'sensor_performance'),
      ],
      summary: [sumRow('sensor_model'), sumRow('battery_hours'), sumRow('polling_rate')],
      reserved: new Set(),
      runningSet: new Set(),
      filters: { ...DEFAULT_FILTERS, search: 'sensor' },
    });
    const keys = result.groups.flatMap((g) => g.keys.map((k) => k.field_key));
    // sensor_model by field_key + polling_rate by group substring match
    assert.ok(keys.includes('sensor_model'));
    assert.ok(keys.includes('polling_rate'));
    assert.ok(!keys.includes('battery_hours'));
  });

  it('drops groups that are empty after filters', () => {
    const result = selectKeyFinderGroupedRows({
      layout: [
        layoutRow('x', 'g1'),
        layoutRow('y', 'g2'),
      ],
      summary: [sumRow('x'), sumRow('y')],
      reserved: new Set(),
      runningSet: new Set(),
      filters: { ...DEFAULT_FILTERS, search: 'x' },
    });
    assert.deepEqual(result.groups.map((g) => g.name), ['g1']);
  });

  it('keys without summary rows still render with null run fields', () => {
    const result = selectKeyFinderGroupedRows({
      layout: [layoutRow('newbie_key', 'g1')],
      summary: [],
      reserved: new Set(),
      runningSet: new Set(),
      filters: DEFAULT_FILTERS,
    });
    assert.equal(result.totals.eligible, 1);
    const row = result.groups[0].keys[0];
    assert.equal(row.last_run_number, null);
    assert.equal(row.run_count, 0);
    assert.equal(row.last_status, null);
  });

  it('empty ungrouped keys coalesce under "_ungrouped"', () => {
    const result = selectKeyFinderGroupedRows({
      layout: [layoutRow('floater', '')],
      summary: [sumRow('floater')],
      reserved: new Set(),
      runningSet: new Set(),
      filters: DEFAULT_FILTERS,
    });
    assert.equal(result.groups[0].name, '_ungrouped');
    assert.equal(result.groups[0].keys.length, 1);
  });
});
