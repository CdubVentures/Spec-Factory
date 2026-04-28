/**
 * Key Finder bulk dispatch planning.
 *
 * BEHAVIORAL class: Run Group, Run All Groups, Loop Group, and Loop All
 * Groups must use the same configured sort-axis precedence that bundle
 * packing uses. Loop All is one global line, not one concurrent line per
 * group, so passenger registrations can affect the next key's bundle.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLoopAllDispatchKeys,
  buildLoopGroupDispatchKeys,
  buildRunAllDispatchKeys,
  buildRunGroupDispatchKeys,
} from '../keyFinderBulkDispatch.ts';
import type { KeyEntry, KeyGroup } from '../../types.ts';

function key(
  fieldKey: string,
  overrides: Partial<Pick<KeyEntry, 'difficulty' | 'required_level' | 'availability' | 'last_status' | 'published' | 'run_blocked_reason' | 'component_run_kind' | 'component_parent_key' | 'component_dependency_satisfied' | 'dedicated_run'>> = {},
): KeyEntry {
  return {
    field_key: fieldKey,
    label: fieldKey,
    difficulty: overrides.difficulty ?? 'easy',
    required_level: overrides.required_level ?? 'non_mandatory',
    availability: overrides.availability ?? 'always',
    variant_dependent: false,
    budget: 1,
    raw_budget: 1,
    in_flight_as_primary: false,
    in_flight_as_passenger_count: 0,
    bundle_pool: 0,
    bundle_total_cost: 0,
    bundle_preview: [],
    last_run_number: null,
    last_value: null,
    last_confidence: null,
    last_status: overrides.last_status ?? null,
    last_model: null,
    last_fallback_used: null,
    last_access_mode: null,
    last_effort_level: null,
    last_thinking: null,
    last_web_search: null,
    candidate_count: 0,
    published: overrides.published ?? false,
    dedicated_run: overrides.dedicated_run ?? false,
    component_run_kind: overrides.component_run_kind ?? '',
    component_parent_key: overrides.component_parent_key ?? '',
    component_dependency_satisfied: overrides.component_dependency_satisfied ?? true,
    run_blocked_reason: overrides.run_blocked_reason ?? '',
    concrete_evidence: false,
    top_confidence: null,
    top_evidence_count: null,
    run_count: 0,
    running: false,
    opMode: null,
    opStatus: null,
    ridingPrimaries: [],
    activePassengers: [],
  };
}

function group(name: string, keys: readonly KeyEntry[]): KeyGroup {
  return {
    name,
    keys,
    stats: {
      total: keys.length,
      resolved: keys.filter((k) => k.last_status === 'resolved' || k.published).length,
      unresolved: keys.filter((k) => k.last_status !== 'resolved' && !k.published).length,
      running: keys.filter((k) => k.running).length,
    },
  };
}

describe('Key Finder bulk dispatch planning', () => {
  const groups = [
    group('switch', [
      key('click_latency', { difficulty: 'hard', required_level: 'mandatory', availability: 'always' }),
      key('switch_type', { difficulty: 'easy', required_level: 'non_mandatory', availability: 'rare' }),
      key('debounce', { difficulty: 'medium', required_level: 'mandatory', availability: 'sometimes' }),
    ]),
    group('design', [
      key('weight', { difficulty: 'easy', required_level: 'mandatory', availability: 'always' }),
      key('width', { difficulty: 'easy', required_level: 'mandatory', availability: 'sometimes' }),
      key('material', { difficulty: 'medium', required_level: 'non_mandatory', availability: 'always' }),
    ]),
  ];

  it('Run Group sorts that group by configured priority instead of Field Studio order', () => {
    assert.deepEqual(buildRunGroupDispatchKeys(groups, 'switch'), [
      'switch_type',
      'debounce',
      'click_latency',
    ]);
  });

  it('Run All Groups flattens all groups and sorts globally', () => {
    assert.deepEqual(buildRunAllDispatchKeys(groups), [
      'weight',
      'width',
      'switch_type',
      'debounce',
      'material',
      'click_latency',
    ]);
  });

  it('Loop Group filters resolved/published keys, then sorts the remaining group line', () => {
    const localGroups = [
      group('sensor', [
        key('sensor_latency', { difficulty: 'hard' }),
        key('dpi', { difficulty: 'medium', last_status: 'resolved' }),
        key('ips', { difficulty: 'easy' }),
        key('sensor_link', { difficulty: 'easy', published: true }),
      ]),
    ];
    assert.deepEqual(buildLoopGroupDispatchKeys(localGroups, 'sensor'), ['ips', 'sensor_latency']);
  });

  it('Run and Loop dispatch planning skip component brand/link keys blocked by an unpublished parent', () => {
    const localGroups = [
      group('sensor', [
        key('sensor', { difficulty: 'medium' }),
        key('sensor_brand', { difficulty: 'medium', run_blocked_reason: 'component_parent_unpublished' }),
        key('sensor_link', { difficulty: 'medium', run_blocked_reason: 'component_parent_unpublished' }),
        key('dpi', { difficulty: 'easy' }),
      ]),
    ];

    assert.deepEqual(buildRunGroupDispatchKeys(localGroups, 'sensor'), ['dpi', 'sensor']);
    assert.deepEqual(buildLoopGroupDispatchKeys(localGroups, 'sensor'), ['dpi', 'sensor']);
  });

  it('Run and Loop dispatch planning treat unsatisfied component brand/link dependencies as locked even without a reason string', () => {
    const localGroups = [
      group('sensor', [
        key('sensor', { difficulty: 'medium' }),
        key('sensor_brand', {
          difficulty: 'medium',
          dedicated_run: true,
          component_run_kind: 'component_brand',
          component_parent_key: 'sensor',
          component_dependency_satisfied: false,
        }),
        key('sensor_link', {
          difficulty: 'medium',
          dedicated_run: true,
          component_run_kind: 'component_link',
          component_parent_key: 'sensor',
          component_dependency_satisfied: false,
        }),
        key('dpi', { difficulty: 'easy' }),
      ]),
    ];

    assert.deepEqual(buildRunGroupDispatchKeys(localGroups, 'sensor'), ['dpi', 'sensor']);
    assert.deepEqual(buildLoopGroupDispatchKeys(localGroups, 'sensor'), ['dpi', 'sensor']);
  });

  it('Loop All Groups returns one global sorted line across all unresolved keys', () => {
    assert.deepEqual(buildLoopAllDispatchKeys(groups), [
      'weight',
      'width',
      'switch_type',
      'debounce',
      'material',
      'click_latency',
    ]);
  });

  it('custom axis precedence changes both Run All and Loop All order', () => {
    const axisOrder = ['availability', 'required_level', 'difficulty'] as const;
    const expected = [
      'weight',
      'click_latency',
      'material',
      'width',
      'debounce',
      'switch_type',
    ];
    assert.deepEqual(buildRunAllDispatchKeys(groups, axisOrder), expected);
    assert.deepEqual(buildLoopAllDispatchKeys(groups, axisOrder), expected);
  });
});
