import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreFetchPhases } from '../src/api/routes/runtimeOpsDataBuilders.js';

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

test('brand_resolved event populates brand_resolution structured data', () => {
  const events = [
    makeEvent('brand_resolved', {
      brand: 'Razer',
      official_domain: 'razer.com',
      aliases: ['Razer Inc', 'Razer USA'],
      support_domain: 'support.razer.com',
      confidence: 0.95,
      candidates: [
        {
          name: 'Razer',
          confidence: 0.95,
          evidence_snippets: ['Official Razer website', 'Razer Inc press release'],
          disambiguation_note: 'Primary gaming peripherals brand',
        },
        {
          name: 'Razer Inc.',
          confidence: 0.8,
          evidence_snippets: ['SEC filing'],
          disambiguation_note: 'Corporate entity name',
        },
      ],
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.ok(result.brand_resolution, 'brand_resolution should be present');
  assert.equal(result.brand_resolution.brand, 'Razer');
  assert.equal(result.brand_resolution.official_domain, 'razer.com');
  assert.deepEqual(result.brand_resolution.aliases, ['Razer Inc', 'Razer USA']);
  assert.equal(result.brand_resolution.support_domain, 'support.razer.com');
  assert.equal(result.brand_resolution.confidence, 0.95);
  assert.equal(result.brand_resolution.candidates.length, 2);
  assert.equal(result.brand_resolution.candidates[0].name, 'Razer');
  assert.deepEqual(result.brand_resolution.candidates[0].evidence_snippets, ['Official Razer website', 'Razer Inc press release']);
});

test('brand_resolution defaults to null when no brand_resolved event', () => {
  const result = buildPreFetchPhases([], makeMeta(), {});
  assert.equal(result.brand_resolution, null);
});

test('search_plan_generated events populate search_plans array', () => {
  const events = [
    makeEvent('search_plan_generated', {
      pass_index: 0,
      pass_name: 'primary',
      queries_generated: ['Razer Viper V3 Pro specs', 'Razer Viper V3 Pro weight'],
      stop_condition: 'max_queries_reached',
      plan_rationale: 'Targeting core identity and critical missing fields',
    }),
    makeEvent('search_plan_generated', {
      pass_index: 1,
      pass_name: 'fast',
      queries_generated: ['Razer Viper V3 Pro DPI sensor'],
      stop_condition: 'all_critical_covered',
      plan_rationale: 'Filling remaining sensor fields',
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.ok(Array.isArray(result.search_plans), 'search_plans should be an array');
  assert.equal(result.search_plans.length, 2);
  assert.equal(result.search_plans[0].pass_index, 0);
  assert.equal(result.search_plans[0].pass_name, 'primary');
  assert.deepEqual(result.search_plans[0].queries_generated, ['Razer Viper V3 Pro specs', 'Razer Viper V3 Pro weight']);
  assert.equal(result.search_plans[0].stop_condition, 'max_queries_reached');
  assert.equal(result.search_plans[0].plan_rationale, 'Targeting core identity and critical missing fields');
  assert.equal(result.search_plans[1].pass_index, 1);
  assert.equal(result.search_plans[1].pass_name, 'fast');
});

test('search_plans defaults to empty array when no events', () => {
  const result = buildPreFetchPhases([], makeMeta(), {});
  assert.ok(Array.isArray(result.search_plans));
  assert.equal(result.search_plans.length, 0);
});

test('search_results_collected events populate search_result_details array', () => {
  const events = [
    makeEvent('search_results_collected', {
      query: 'Razer Viper V3 Pro specs',
      provider: 'searxng',
      dedupe_count: 3,
      results: [
        { title: 'Razer Viper V3 Pro - Official', url: 'https://razer.com/viper-v3-pro', domain: 'razer.com', snippet: 'Official specs page', rank: 1, relevance_score: 0.95, decision: 'keep', reason: 'manufacturer page' },
        { title: 'Viper V3 Pro Review', url: 'https://rtings.com/viper-v3-pro', domain: 'rtings.com', snippet: 'Lab review', rank: 2, relevance_score: 0.85, decision: 'keep', reason: 'lab review site' },
      ],
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.ok(Array.isArray(result.search_result_details), 'search_result_details should be an array');
  assert.equal(result.search_result_details.length, 1);
  assert.equal(result.search_result_details[0].query, 'Razer Viper V3 Pro specs');
  assert.equal(result.search_result_details[0].provider, 'searxng');
  assert.equal(result.search_result_details[0].dedupe_count, 3);
  assert.equal(result.search_result_details[0].results.length, 2);
  assert.equal(result.search_result_details[0].results[0].title, 'Razer Viper V3 Pro - Official');
  assert.equal(result.search_result_details[0].results[0].decision, 'keep');
});

test('search_result_details defaults to empty array when no events', () => {
  const result = buildPreFetchPhases([], makeMeta(), {});
  assert.ok(Array.isArray(result.search_result_details));
  assert.equal(result.search_result_details.length, 0);
});

test('urls_predicted event populates url_predictions structured data', () => {
  const events = [
    makeEvent('urls_predicted', {
      remaining_budget: 15,
      predictions: [
        { url: 'https://razer.com/viper-v3-pro/specs', domain: 'razer.com', predicted_payoff: 92, target_fields: ['weight', 'sensor', 'dpi'], risk_flags: [], decision: 'fetch' },
        { url: 'https://razer.com/support/viper-v3-pro', domain: 'razer.com', predicted_payoff: 65, target_fields: ['warranty', 'dimensions'], risk_flags: ['pdf_only'], decision: 'fetch' },
        { url: 'https://sketchy.site/review', domain: 'sketchy.site', predicted_payoff: 20, target_fields: ['weight'], risk_flags: ['low_trust', 'potential_paywall'], decision: 'skip' },
      ],
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.ok(result.url_predictions, 'url_predictions should be present');
  assert.equal(result.url_predictions.remaining_budget, 15);
  assert.equal(result.url_predictions.predictions.length, 3);
  assert.equal(result.url_predictions.predictions[0].url, 'https://razer.com/viper-v3-pro/specs');
  assert.equal(result.url_predictions.predictions[0].predicted_payoff, 92);
  assert.deepEqual(result.url_predictions.predictions[0].target_fields, ['weight', 'sensor', 'dpi']);
  assert.equal(result.url_predictions.predictions[2].decision, 'skip');
  assert.deepEqual(result.url_predictions.predictions[2].risk_flags, ['low_trust', 'potential_paywall']);
});

test('url_predictions defaults to null when no urls_predicted event', () => {
  const result = buildPreFetchPhases([], makeMeta(), {});
  assert.equal(result.url_predictions, null);
});

test('serp_triage_completed events populate serp_triage array', () => {
  const events = [
    makeEvent('serp_triage_completed', {
      query: 'Razer Viper V3 Pro specs',
      kept_count: 5,
      dropped_count: 3,
      candidates: [
        {
          url: 'https://razer.com/viper-v3-pro',
          title: 'Razer Viper V3 Pro',
          domain: 'razer.com',
          snippet: 'Official product page with full specifications',
          score: 0.95,
          decision: 'keep',
          rationale: 'Manufacturer official page with high spec coverage',
          score_components: { base_relevance: 0.8, tier_boost: 0.1, identity_match: 0.1, penalties: -0.05 },
        },
        {
          url: 'https://example.com/unrelated',
          title: 'Unrelated page',
          domain: 'example.com',
          snippet: 'Not relevant',
          score: 0.15,
          decision: 'drop',
          rationale: 'No spec content detected',
          score_components: { base_relevance: 0.1, tier_boost: 0, identity_match: 0.05, penalties: 0 },
        },
      ],
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.ok(Array.isArray(result.serp_triage), 'serp_triage should be an array');
  assert.equal(result.serp_triage.length, 1);
  assert.equal(result.serp_triage[0].query, 'Razer Viper V3 Pro specs');
  assert.equal(result.serp_triage[0].kept_count, 5);
  assert.equal(result.serp_triage[0].dropped_count, 3);
  assert.equal(result.serp_triage[0].candidates.length, 2);
  assert.equal(result.serp_triage[0].candidates[0].score, 0.95);
  assert.equal(result.serp_triage[0].candidates[0].decision, 'keep');
  assert.ok(result.serp_triage[0].candidates[0].score_components);
  assert.equal(result.serp_triage[0].candidates[0].score_components.base_relevance, 0.8);
});

test('serp_triage defaults to empty array when no events', () => {
  const result = buildPreFetchPhases([], makeMeta(), {});
  assert.ok(Array.isArray(result.serp_triage));
  assert.equal(result.serp_triage.length, 0);
});

test('domains_classified events populate domain_health array', () => {
  const events = [
    makeEvent('domains_classified', {
      classifications: [
        { domain: 'razer.com', role: 'manufacturer', safety_class: 'safe', budget_score: 95, cooldown_remaining: 0, success_rate: 0.98, avg_latency_ms: 450, notes: 'Primary manufacturer' },
        { domain: 'rtings.com', role: 'lab_review', safety_class: 'safe', budget_score: 88, cooldown_remaining: 0, success_rate: 0.95, avg_latency_ms: 800, notes: 'Trusted lab review' },
        { domain: 'sketchy.site', role: 'unknown', safety_class: 'blocked', budget_score: 5, cooldown_remaining: 1800, success_rate: 0.1, avg_latency_ms: 5000, notes: 'Repeated 403s' },
      ],
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.ok(Array.isArray(result.domain_health), 'domain_health should be an array');
  assert.equal(result.domain_health.length, 3);
  assert.equal(result.domain_health[0].domain, 'razer.com');
  assert.equal(result.domain_health[0].role, 'manufacturer');
  assert.equal(result.domain_health[0].safety_class, 'safe');
  assert.equal(result.domain_health[0].budget_score, 95);
  assert.equal(result.domain_health[0].cooldown_remaining, 0);
  assert.equal(result.domain_health[0].success_rate, 0.98);
  assert.equal(result.domain_health[0].avg_latency_ms, 450);
  assert.equal(result.domain_health[2].safety_class, 'blocked');
});

test('domain_health defaults to empty array when no events', () => {
  const result = buildPreFetchPhases([], makeMeta(), {});
  assert.ok(Array.isArray(result.domain_health));
  assert.equal(result.domain_health.length, 0);
});

test('multiple domains_classified events merge into single domain_health array', () => {
  const events = [
    makeEvent('domains_classified', {
      classifications: [
        { domain: 'razer.com', role: 'manufacturer', safety_class: 'safe', budget_score: 95, cooldown_remaining: 0, success_rate: 0.98, avg_latency_ms: 450, notes: '' },
      ],
    }),
    makeEvent('domains_classified', {
      classifications: [
        { domain: 'rtings.com', role: 'lab_review', safety_class: 'safe', budget_score: 88, cooldown_remaining: 0, success_rate: 0.95, avg_latency_ms: 800, notes: '' },
      ],
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.domain_health.length, 2);
  assert.equal(result.domain_health[0].domain, 'razer.com');
  assert.equal(result.domain_health[1].domain, 'rtings.com');
});

test('new structured fields coexist with existing fields in buildPreFetchPhases', () => {
  const events = [
    makeEvent('needset_computed', {
      needset_size: 12,
      total_fields: 40,
      identity_status: 'locked',
      identity_confidence: 0.95,
      needs: [{ field: 'weight', required: 'required', need_score: 0.8 }],
      reason_counts: { missing: 5 },
      required_level_counts: { required: 8 },
    }),
    makeEvent('brand_resolved', {
      brand: 'Razer',
      official_domain: 'razer.com',
      aliases: [],
      support_domain: '',
      confidence: 0.9,
      candidates: [],
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
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});

  assert.equal(result.needset.needset_size, 12, 'existing needset unchanged');
  assert.equal(result.llm_calls.brand_resolver.length, 1, 'existing llm_calls unchanged');
  assert.equal(result.search_results.length, 1, 'existing search_results unchanged');

  assert.equal(result.brand_resolution.brand, 'Razer', 'new brand_resolution present');
  assert.equal(result.search_plans.length, 1, 'new search_plans present');
  assert.ok(Array.isArray(result.search_result_details), 'new search_result_details present');
  assert.equal(result.url_predictions, null, 'null when no urls_predicted event');
  assert.ok(Array.isArray(result.serp_triage), 'new serp_triage present');
  assert.ok(Array.isArray(result.domain_health), 'new domain_health present');
});

test('brand_resolved event handles missing optional fields gracefully', () => {
  const events = [
    makeEvent('brand_resolved', {
      brand: 'Razer',
      official_domain: 'razer.com',
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.ok(result.brand_resolution);
  assert.equal(result.brand_resolution.brand, 'Razer');
  assert.equal(result.brand_resolution.official_domain, 'razer.com');
  assert.deepEqual(result.brand_resolution.aliases, []);
  assert.equal(result.brand_resolution.support_domain, '');
  assert.equal(result.brand_resolution.confidence, 0);
  assert.deepEqual(result.brand_resolution.candidates, []);
});

test('search_results_collected handles empty results array', () => {
  const events = [
    makeEvent('search_results_collected', {
      query: 'no results query',
      provider: 'searxng',
      dedupe_count: 0,
      results: [],
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.search_result_details.length, 1);
  assert.equal(result.search_result_details[0].results.length, 0);
  assert.equal(result.search_result_details[0].dedupe_count, 0);
});

test('serp_triage_completed handles candidates with missing score_components', () => {
  const events = [
    makeEvent('serp_triage_completed', {
      query: 'test query',
      kept_count: 1,
      dropped_count: 0,
      candidates: [
        {
          url: 'https://example.com',
          title: 'Test',
          domain: 'example.com',
          snippet: 'test snippet',
          score: 0.7,
          decision: 'keep',
          rationale: 'relevant',
        },
      ],
    }),
  ];
  const result = buildPreFetchPhases(events, makeMeta(), {});
  assert.equal(result.serp_triage[0].candidates[0].score, 0.7);
  assert.ok(result.serp_triage[0].candidates[0].score_components != null);
});
