import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreFetchPhases } from '../runtimeOpsDataBuilders.js';
import { makeEvent, makeMeta } from './fixtures/runtimeOpsDataBuildersHarness.js';

test('buildPreFetchPhases: search_plan_generated preserves enriched plan fields across passes', () => {
  const result = buildPreFetchPhases([
    makeEvent('search_plan_generated', {
      pass_index: 0,
      pass_name: 'primary',
      queries_generated: ['query A', 'query B'],
      stop_condition: 'planner_complete',
      plan_rationale: 'Primary pass',
      query_target_map: { 'query A': ['weight'], 'query B': ['sensor'] },
      missing_critical_fields: ['weight', 'sensor'],
      mode: 'standard',
    }),
    makeEvent('search_plan_generated', {
      pass_index: 1,
      pass_name: 'fast',
      queries_generated: ['query C'],
      stop_condition: 'all_critical_covered',
      plan_rationale: 'Fast pass',
      query_target_map: { 'query C': ['dpi', 'polling_rate'] },
      missing_critical_fields: ['dpi', 'polling_rate'],
      mode: 'uber_aggressive',
    }),
  ], makeMeta(), {});

  assert.equal(result.search_plans.length, 2);
  assert.deepEqual(result.search_plans[0], {
    pass_index: 0,
    pass_name: 'primary',
    queries_generated: ['query A', 'query B'],
    stop_condition: 'planner_complete',
    plan_rationale: 'Primary pass',
    query_target_map: { 'query A': ['weight'], 'query B': ['sensor'] },
    missing_critical_fields: ['weight', 'sensor'],
    mode: 'standard',
    source: '',
    enhancement_rows: [],
  });
  assert.deepEqual(result.search_plans[1], {
    pass_index: 1,
    pass_name: 'fast',
    queries_generated: ['query C'],
    stop_condition: 'all_critical_covered',
    plan_rationale: 'Fast pass',
    query_target_map: { 'query C': ['dpi', 'polling_rate'] },
    missing_critical_fields: ['dpi', 'polling_rate'],
    mode: 'uber_aggressive',
    source: '',
    enhancement_rows: [],
  });
});

test('buildPreFetchPhases: search_plan_generated defaults missing enrichment fields gracefully', () => {
  const result = buildPreFetchPhases([
    makeEvent('search_plan_generated', {
      pass_index: 0,
      pass_name: 'primary',
      queries_generated: ['test query'],
      stop_condition: 'done',
      plan_rationale: 'test',
    }),
  ], makeMeta(), {});

  assert.deepEqual(result.search_plans, [{
    pass_index: 0,
    pass_name: 'primary',
    queries_generated: ['test query'],
    stop_condition: 'done',
    plan_rationale: 'test',
    query_target_map: {},
    missing_critical_fields: [],
    mode: '',
    source: '',
    enhancement_rows: [],
  }]);
});
