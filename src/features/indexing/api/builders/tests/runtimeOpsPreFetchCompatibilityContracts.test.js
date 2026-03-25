import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreFetchPhases } from '../runtimeOpsDataBuilders.js';
import { makeEvent, makeMeta } from './fixtures/runtimeOpsDataBuildersHarness.js';

test('buildPreFetchPhases: structured prefetch sections default to null or empty collections when absent', () => {
  const result = buildPreFetchPhases([], makeMeta(), {});

  assert.equal(result.brand_resolution, null);
  assert.deepEqual(result.search_plans, []);
  assert.deepEqual(result.search_result_details, []);
  assert.deepEqual(result.serp_selector, []);
  assert.deepEqual(result.domain_health, []);
});

test('buildPreFetchPhases: structured prefetch sections coexist with existing needset, llm, and search outputs', () => {
  const result = buildPreFetchPhases([
    makeEvent('needset_computed', {
      needset_size: 12,
      total_fields: 40,
      identity: { state: 'locked', confidence: 0.95 },
      fields: [{ field_key: 'weight', required_level: 'required', state: 'missing', need_score: 0.8 }],
      summary: { total: 40, resolved: 28 },
      blockers: { missing: 5 },
    }),
    makeEvent('brand_resolved', {
      brand: 'Razer',
      official_domain: 'razer.com',
      aliases: [],
      support_domain: '',
      confidence: 0.9,
      reasoning: [],
    }),
    makeEvent('search_plan_generated', {
      pass_index: 0,
      pass_name: 'primary',
      queries_generated: ['test query'],
      stop_condition: 'done',
      plan_rationale: 'test',
    }),
    makeEvent('llm_started', { reason: 'brand_resolution', batch_id: 'br-1' }),
    makeEvent('llm_finished', { reason: 'brand_resolution', batch_id: 'br-1', tokens: { input: 100, output: 50 } }),
    makeEvent('search_started', { query: 'test query', provider: 'searxng', worker_id: 's-1' }),
    makeEvent('search_finished', { query: 'test query', provider: 'searxng', result_count: 10, worker_id: 's-1' }),
  ], makeMeta(), {});

  assert.equal(result.needset.needset_size, 12);
  assert.equal(result.llm_calls.brand_resolver.length, 1);
  assert.equal(result.search_results.length, 1);
  assert.equal(result.brand_resolution?.brand, 'Razer');
  assert.equal(result.search_plans.length, 1);
  assert.ok(Array.isArray(result.search_result_details));
  assert.ok(Array.isArray(result.serp_selector));
  assert.ok(Array.isArray(result.domain_health));
});

test('buildPreFetchPhases: needset artifact identity conflict breakdown survives into the prefetch payload', () => {
  const result = buildPreFetchPhases([], makeMeta(), {
    needset: {
      total_fields: 80,
      identity: { state: 'conflict' },
      fields: [
        { field_key: 'weight', state: 'missing', need_score: 10 },
        { field_key: 'sensor', state: 'missing', need_score: 8 },
        { field_key: 'dpi', state: 'missing', need_score: 6 },
        { field_key: 'polling_rate', state: 'missing', need_score: 4 },
      ],
      summary: {},
      blockers: {},
    },
  });

  assert.equal(result.needset.identity_state, 'conflict');
  assert.equal(result.needset.needset_size, 4);
  assert.equal(result.needset.total_fields, 80);
  assert.equal(result.needset.fields.length, 4);
});
