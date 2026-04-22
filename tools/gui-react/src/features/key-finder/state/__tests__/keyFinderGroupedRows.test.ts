/**
 * keyFinderGroupedRows selector — pure function tests.
 *
 * BEHAVIORAL class: state transitions + filter logic + grouping invariants.
 * UI component rendering is NOT tested (per feedback_prompt_test_looseness).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectKeyFinderGroupedRows, sortKeysByPriority } from '../keyFinderGroupedRows.ts';
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
    raw_budget: 5,
    in_flight_as_primary: false,
    in_flight_as_passenger_count: 0,
    bundle_preview: [],
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

  it('totals.base = pre-filter eligible count (after exclusions, before user filters)', () => {
    // Layout: 3 post-exclusion eligible (a, b, c), 1 variant-dependent (d), 1 reserved (e)
    // Active filter narrows to just `a`. base must remain 3.
    const result = selectKeyFinderGroupedRows({
      layout: [
        layoutRow('a', 'g1'),
        layoutRow('b', 'g1'),
        layoutRow('c', 'g1'),
        layoutRow('d', 'g1', 'D', true), // variant_dependent → excluded
        layoutRow('e', 'g1'),             // reserved → excluded
      ],
      summary: [
        sumRow('a', { required_level: 'mandatory', last_status: 'unresolved' }),
        sumRow('b', { required_level: 'non_mandatory', last_status: 'unresolved' }),
        sumRow('c', { required_level: 'mandatory', last_status: 'resolved' }),
      ],
      reserved: new Set(['e']),
      runningSet: new Set(),
      filters: { ...DEFAULT_FILTERS, required: 'mandatory', status: 'unresolved' },
    });
    assert.equal(result.totals.eligible, 1, 'filter narrows to just `a`');
    assert.equal(result.totals.base, 3, 'base = 5 layout - 2 exclusions, independent of user filter');
    assert.equal(result.totals.excluded, 2);
  });
});

describe('sortKeysByPriority — Loop chain ordering', () => {
  const row = (
    field_key: string,
    required_level: string,
    availability: string,
    difficulty: string,
  ) => ({ field_key, required_level, availability, difficulty });

  it('sorts mandatory before non_mandatory', () => {
    const result = sortKeysByPriority([
      row('b', 'non_mandatory', 'always', 'easy'),
      row('a', 'mandatory', 'always', 'easy'),
    ]);
    assert.deepEqual(result.map((r) => r.field_key), ['a', 'b']);
  });

  it('within same required_level, sorts always < sometimes < rare', () => {
    const result = sortKeysByPriority([
      row('c', 'mandatory', 'rare', 'easy'),
      row('a', 'mandatory', 'always', 'easy'),
      row('b', 'mandatory', 'sometimes', 'easy'),
    ]);
    assert.deepEqual(result.map((r) => r.field_key), ['a', 'b', 'c']);
  });

  it('within same availability, sorts easy < medium < hard < very_hard', () => {
    const result = sortKeysByPriority([
      row('d', 'mandatory', 'always', 'very_hard'),
      row('a', 'mandatory', 'always', 'easy'),
      row('c', 'mandatory', 'always', 'hard'),
      row('b', 'mandatory', 'always', 'medium'),
    ]);
    assert.deepEqual(result.map((r) => r.field_key), ['a', 'b', 'c', 'd']);
  });

  it('field_key is the deterministic tiebreaker when all axes tie', () => {
    const result = sortKeysByPriority([
      row('zebra', 'mandatory', 'always', 'easy'),
      row('alpha', 'mandatory', 'always', 'easy'),
      row('mango', 'mandatory', 'always', 'easy'),
    ]);
    assert.deepEqual(result.map((r) => r.field_key), ['alpha', 'mango', 'zebra']);
  });

  it('full 4-axis precedence: required_level > availability > difficulty > field_key', () => {
    // Mixed set — mandatory-rare-easy should beat non_mandatory-always-easy
    // because required_level is the most significant axis.
    const result = sortKeysByPriority([
      row('non_mand_always_easy', 'non_mandatory', 'always', 'easy'),
      row('mand_rare_easy', 'mandatory', 'rare', 'easy'),
      row('mand_always_hard', 'mandatory', 'always', 'hard'),
      row('mand_always_easy', 'mandatory', 'always', 'easy'),
    ]);
    assert.deepEqual(result.map((r) => r.field_key), [
      'mand_always_easy',   // mand + always + easy
      'mand_always_hard',   // mand + always + hard
      'mand_rare_easy',     // mand + rare + easy
      'non_mand_always_easy', // non-mand last regardless of other axes
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [
      row('b', 'non_mandatory', 'always', 'easy'),
      row('a', 'mandatory', 'always', 'easy'),
    ];
    const snapshot = input.map((r) => r.field_key);
    sortKeysByPriority(input);
    assert.deepEqual(input.map((r) => r.field_key), snapshot, 'input order preserved');
  });

  it('unknown axis values fall to the back (defensive)', () => {
    // Unknown required_level rank → highest fallback
    const result = sortKeysByPriority([
      row('unknown', 'bogus', 'always', 'easy'),
      row('mand', 'mandatory', 'always', 'easy'),
    ]);
    assert.deepEqual(result.map((r) => r.field_key), ['mand', 'unknown']);
  });
});
