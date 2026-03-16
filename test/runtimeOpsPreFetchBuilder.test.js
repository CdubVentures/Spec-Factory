import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreFetchPhases } from '../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

function makeEvent(event, payload = {}, overrides = {}) {
  return {
    run_id: 'run-001',
    ts: '2026-02-20T00:01:00.000Z',
    event,
    payload,
    ...overrides,
  };
}

function makeMeta(overrides = {}) {
  return {
    run_id: 'run-001',
    category: 'mouse',
    product_id: 'mouse-test-brand-model',
    started_at: '2026-02-20T00:00:00.000Z',
    status: 'running',
    ...overrides,
  };
}

test('buildPreFetchPhases: empty events returns baseline shape', () => {
  const result = buildPreFetchPhases([], makeMeta(), {});
  assert.ok(result && typeof result === 'object');
  assert.ok(result.needset && typeof result.needset === 'object');
  assert.ok(result.search_profile && typeof result.search_profile === 'object');
  assert.ok(result.llm_calls && typeof result.llm_calls === 'object');
  assert.ok(Array.isArray(result.search_results));
  assert.equal(result.needset.needset_size, 0);
  assert.equal(result.needset.total_fields, 0);
  assert.deepEqual(result.needset.fields, []);
  assert.deepEqual(result.needset.snapshots, []);
  assert.equal(result.search_profile.query_count, 0);
  assert.deepEqual(result.search_profile.query_rows, []);
  assert.deepEqual(result.llm_calls.brand_resolver, []);
  assert.deepEqual(result.llm_calls.search_planner, []);
  assert.deepEqual(result.llm_calls.serp_triage, []);
  assert.deepEqual(result.llm_calls.domain_classifier, []);
  assert.deepEqual(result.search_results, []);
});

test('buildPreFetchPhases: extracts needset data from needset_computed events', () => {
  const events = [
    makeEvent('needset_computed', {
      needset_size: 12,
      total_fields: 40,
      identity: { state: 'locked', confidence: 0.95 },
      fields: [
        { field_key: 'weight', required_level: 'required', state: 'missing', need_score: 0.8 },
        { field_key: 'sensor', required_level: 'required', state: 'weak', need_score: 0.6 },
      ],
      summary: { total: 40, resolved: 28 },
      blockers: { missing: 5, weak: 3, conflict: 2 },
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.needset.needset_size, 12);
  assert.equal(result.needset.total_fields, 40);
  assert.equal(result.needset.identity_state, 'locked');
  assert.equal(result.needset.fields.length, 2);
  assert.equal(result.needset.fields[0].field_key, 'weight');
  assert.deepEqual(result.needset.summary, { total: 40, resolved: 28 });
  assert.deepEqual(result.needset.blockers, { missing: 5, weak: 3, conflict: 2 });
});

test('buildPreFetchPhases: multiple needset_computed events create snapshots and use last for fields', () => {
  const events = [
    makeEvent('needset_computed', {
      needset_size: 20,
      total_fields: 40,
      identity: { state: 'provisional' },
      fields: [{ field_key: 'weight', state: 'missing', need_score: 0.9 }],
      summary: {},
      blockers: {},
    }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('needset_computed', {
      needset_size: 10,
      total_fields: 40,
      identity: { state: 'locked' },
      fields: [{ field_key: 'sensor', state: 'weak', need_score: 0.4 }],
      summary: {},
      blockers: {},
    }, { ts: '2026-02-20T00:02:00.000Z' }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.needset.needset_size, 10);
  assert.equal(result.needset.snapshots.length, 2);
  assert.equal(result.needset.snapshots[0].needset_size, 20);
  assert.equal(result.needset.snapshots[1].needset_size, 10);
  assert.equal(result.needset.fields[0].field_key, 'sensor');
});

test('buildPreFetchPhases: enriches needset from artifacts when events are empty', () => {
  const artifacts = {
    needset: {
      total_fields: 42,
      identity: { state: 'locked' },
      fields: [
        { field_key: 'dpi', required_level: 'required', need_score: 0.7, state: 'missing' },
      ],
      summary: {},
      blockers: {},
    },
  };
  const result = buildPreFetchPhases([], makeMeta(), artifacts);
  assert.equal(result.needset.needset_size, 1);
  assert.equal(result.needset.total_fields, 42);
  assert.equal(result.needset.fields.length, 1);
  assert.equal(result.needset.fields[0].field_key, 'dpi');
});

test('buildPreFetchPhases: extracts search_profile from artifacts', () => {
  const artifacts = {
    search_profile: {
      query_count: 8,
      provider: 'searxng',
      llm_query_planning: true,
      identity_aliases: ['Razer Viper V3 Pro', 'Razer Viper V3'],
      variant_guard_terms: ['wireless', 'wired'],
      query_rows: [
        { query: 'Razer Viper V3 Pro specs', target_fields: ['weight', 'sensor'], result_count: 12, providers: ['searxng'] },
      ],
      query_guard: { total: 8, guarded: 2 },
      field_rule_gate_counts: {
        'search_hints.query_terms': { value_count: 2, enabled_field_count: 1, disabled_field_count: 0, status: 'active' },
      },
      field_rule_hint_counts_by_field: {
        weight: {
          query_terms: { value_count: 2, status: 'active' },
          domain_hints: { value_count: 1, status: 'active' },
          preferred_content_types: { value_count: 1, status: 'active' },
        },
      },
    },
  };
  const result = buildPreFetchPhases([], makeMeta(), artifacts);
  assert.equal(result.search_profile.query_count, 8);
  assert.equal(result.search_profile.provider, 'searxng');
  assert.equal(result.search_profile.llm_query_planning, true);
  assert.deepEqual(result.search_profile.identity_aliases, ['Razer Viper V3 Pro', 'Razer Viper V3']);
  assert.equal(result.search_profile.query_rows.length, 1);
  assert.equal(result.search_profile.query_rows[0].query, 'Razer Viper V3 Pro specs');
  assert.equal(result.search_profile.field_rule_gate_counts?.['search_hints.query_terms']?.value_count, 2);
  assert.equal(result.search_profile.field_rule_hint_counts_by_field?.weight?.domain_hints?.value_count, 1);
});

test('buildPreFetchPhases: groups brand_resolution LLM calls', () => {
  const events = [
    makeEvent('llm_started', {
      reason: 'brand_resolution',
      model: 'gemini-2.0-flash',
      provider: 'gemini',
      batch_id: 'br-1',
      prompt_preview: 'Resolve brand...',
    }, { ts: '2026-02-20T00:00:30.000Z' }),
    makeEvent('llm_finished', {
      reason: 'brand_resolution',
      model: 'gemini-2.0-flash',
      provider: 'gemini',
      batch_id: 'br-1',
      tokens: { input: 100, output: 50 },
      response_preview: '{"brand":"Razer"}',
    }, { ts: '2026-02-20T00:00:32.000Z' }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.llm_calls.brand_resolver.length, 1);
  assert.equal(result.llm_calls.brand_resolver[0].status, 'finished');
  assert.equal(result.llm_calls.brand_resolver[0].reason, 'brand_resolution');
  assert.equal(result.llm_calls.brand_resolver[0].model, 'gemini-2.0-flash');
  assert.equal(result.llm_calls.brand_resolver[0].provider, 'gemini');
  assert.ok(result.llm_calls.brand_resolver[0].duration_ms >= 0);
  assert.equal(result.llm_calls.brand_resolver[0].prompt_preview, 'Resolve brand...');
  assert.equal(result.llm_calls.brand_resolver[0].response_preview, '{"brand":"Razer"}');
});

test('buildPreFetchPhases: groups discovery_planner LLM calls under search_planner', () => {
  const events = [
    makeEvent('llm_started', { reason: 'discovery_planner_primary', batch_id: 'sp-1' }),
    makeEvent('llm_finished', { reason: 'discovery_planner_primary', batch_id: 'sp-1', tokens: { input: 200, output: 100 } }),
    makeEvent('llm_started', { reason: 'discovery_planner_fast', batch_id: 'sp-2' }),
    makeEvent('llm_finished', { reason: 'discovery_planner_fast', batch_id: 'sp-2', tokens: { input: 150, output: 80 } }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.llm_calls.search_planner.length, 2);
  assert.equal(result.llm_calls.search_planner[0].reason, 'discovery_planner_primary');
  assert.equal(result.llm_calls.search_planner[1].reason, 'discovery_planner_fast');
});

test('buildPreFetchPhases: groups triage/rerank/serp LLM calls under serp_triage', () => {
  const events = [
    makeEvent('llm_started', { reason: 'serp_triage_batch', batch_id: 'st-1' }),
    makeEvent('llm_finished', { reason: 'serp_triage_batch', batch_id: 'st-1' }),
    makeEvent('llm_started', { reason: 'rerank_candidates', batch_id: 'st-2' }),
    makeEvent('llm_finished', { reason: 'rerank_candidates', batch_id: 'st-2' }),
    makeEvent('llm_started', { reason: 'serp_quality_check', batch_id: 'st-3' }),
    makeEvent('llm_finished', { reason: 'serp_quality_check', batch_id: 'st-3' }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.llm_calls.serp_triage.length, 3);
});

test('buildPreFetchPhases: groups domain_safety_classification under domain_classifier', () => {
  const events = [
    makeEvent('llm_started', { reason: 'domain_safety_classification', batch_id: 'dc-1' }),
    makeEvent('llm_finished', { reason: 'domain_safety_classification', batch_id: 'dc-1' }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.llm_calls.domain_classifier.length, 1);
  assert.equal(result.llm_calls.domain_classifier[0].reason, 'domain_safety_classification');
});

test('buildPreFetchPhases: llm_failed events are captured with error status', () => {
  const events = [
    makeEvent('llm_started', { reason: 'brand_resolution', batch_id: 'br-fail', model: 'gpt-4o' }),
    makeEvent('llm_failed', { reason: 'brand_resolution', batch_id: 'br-fail', message: 'rate_limited' }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.llm_calls.brand_resolver.length, 1);
  assert.equal(result.llm_calls.brand_resolver[0].status, 'failed');
  assert.equal(result.llm_calls.brand_resolver[0].error, 'rate_limited');
});

test('buildPreFetchPhases: extracts search results from search_started/finished events', () => {
  const events = [
    makeEvent('search_started', {
      query: 'Razer Viper V3 Pro specifications',
      provider: 'searxng',
      worker_id: 'search-1',
    }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('search_finished', {
      query: 'Razer Viper V3 Pro specifications',
      provider: 'searxng',
      result_count: 15,
      worker_id: 'search-1',
    }, { ts: '2026-02-20T00:01:02.000Z' }),
    makeEvent('search_started', {
      query: 'Razer Viper V3 Pro sensor DPI',
      provider: 'searxng',
      worker_id: 'search-2',
    }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('search_finished', {
      query: 'Razer Viper V3 Pro sensor DPI',
      provider: 'searxng',
      result_count: 8,
      worker_id: 'search-2',
    }, { ts: '2026-02-20T00:01:06.000Z' }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.search_results.length, 2);
  assert.equal(result.search_results[0].query, 'Razer Viper V3 Pro specifications');
  assert.equal(result.search_results[0].result_count, 15);
  assert.equal(result.search_results[0].provider, 'searxng');
  assert.ok(result.search_results[0].duration_ms >= 0);
  assert.equal(result.search_results[1].query, 'Razer Viper V3 Pro sensor DPI');
});

test('buildPreFetchPhases: aggregates search_request_throttled events into search results rows', () => {
  const events = [
    makeEvent('search_started', {
      query: 'Razer Viper V3 Pro specifications',
      provider: 'searxng',
      worker_id: 'search-1',
    }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('search_request_throttled', {
      query: 'Razer Viper V3 Pro specifications',
      provider: 'searxng',
      key: '127.0.0.1',
      wait_ms: 350,
    }, { ts: '2026-02-20T00:01:01.000Z' }),
    makeEvent('search_request_throttled', {
      query: 'Razer Viper V3 Pro specifications',
      provider: 'searxng',
      key: '127.0.0.1',
      wait_ms: 150,
    }, { ts: '2026-02-20T00:01:01.250Z' }),
    makeEvent('search_finished', {
      query: 'Razer Viper V3 Pro specifications',
      provider: 'searxng',
      result_count: 15,
      worker_id: 'search-1',
    }, { ts: '2026-02-20T00:01:02.000Z' }),
  ];

  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.search_results.length, 1);
  assert.equal(result.search_results[0].query, 'Razer Viper V3 Pro specifications');
  assert.equal(result.search_results[0].throttle_events, 2);
  assert.equal(result.search_results[0].throttle_wait_ms, 500);
});

test('buildPreFetchPhases: non-prefetch LLM calls are not included in any group', () => {
  const events = [
    makeEvent('llm_started', { reason: 'extract_candidates_batch', batch_id: 'ex-1' }),
    makeEvent('llm_finished', { reason: 'extract_candidates_batch', batch_id: 'ex-1' }),
    makeEvent('llm_started', { reason: 'validate_field_batch', batch_id: 'vl-1' }),
    makeEvent('llm_finished', { reason: 'validate_field_batch', batch_id: 'vl-1' }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.llm_calls.brand_resolver.length, 0);
  assert.equal(result.llm_calls.search_planner.length, 0);
  assert.equal(result.llm_calls.serp_triage.length, 0);
  assert.equal(result.llm_calls.domain_classifier.length, 0);
});

test('buildPreFetchPhases: handles null/undefined artifacts gracefully', () => {
  const result = buildPreFetchPhases([], makeMeta(), null);
  assert.ok(result && typeof result === 'object');
  assert.equal(result.needset.needset_size, 0);
  assert.equal(result.search_profile.query_count, 0);

  const result2 = buildPreFetchPhases([], makeMeta());
  assert.ok(result2 && typeof result2 === 'object');
});

test('buildPreFetchPhases: tokens are extracted from llm_finished payload', () => {
  const events = [
    makeEvent('llm_started', { reason: 'brand_resolution', batch_id: 'tok-1', model: 'gpt-4o' }),
    makeEvent('llm_finished', {
      reason: 'brand_resolution',
      batch_id: 'tok-1',
      model: 'gpt-4o',
      tokens: { input: 250, output: 120 },
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  const call = result.llm_calls.brand_resolver[0];
  assert.deepEqual(call.tokens, { input: 250, output: 120 });
});
