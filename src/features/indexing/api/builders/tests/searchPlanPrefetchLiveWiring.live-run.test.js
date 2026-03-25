import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreFetchPhases,
  makeEvent,
  makeMeta,
  makeSearchPlanNeedsetComputedPayload,
} from './helpers/searchPlanPrefetchLiveWiringHarness.js';
// ---------------------------------------------------------------------------
// 3. Full live-run simulation: every prefetch tab populated simultaneously
//    Search Plan needset + brand + search plans + search results + SERP triage +
//    domain health + LLM calls — all in one event stream
// ---------------------------------------------------------------------------

test('buildPreFetchPhases: full live-run simulation populates every prefetch tab and needset', () => {
  const events = [
    // -- Needset with full Search Plan panel data --
    makeEvent('needset_computed', makeSearchPlanNeedsetComputedPayload(), { ts: '2026-03-16T00:00:05.000Z' }),

    // -- Brand resolution --
    makeEvent('brand_resolved', {
      brand: 'Razer',
      status: 'resolved',
      official_domain: 'razer.com',
      aliases: ['Razer Inc', 'Razer USA', 'RZ01-0490'],
      support_domain: 'support.razer.com',
      confidence: 0.97,
      candidates: [
        { name: 'Razer', confidence: 0.97, evidence_snippets: ['Official Razer website', 'SEC filing: Razer Inc.'], disambiguation_note: 'Primary gaming peripherals brand' },
        { name: 'Razer Inc.', confidence: 0.82, evidence_snippets: ['Corporate registration'], disambiguation_note: 'Corporate entity name' },
      ],
      reasoning: [
        'LLM identified razer.com as the official manufacturer domain',
        'Alias RZ01-0490 confirmed via product database',
        'Support subdomain support.razer.com verified',
      ],
    }, { ts: '2026-03-16T00:00:08.000Z' }),

    // -- LLM calls: brand resolver --
    makeEvent('llm_started', {
      reason: 'brand_resolution', batch_id: 'br-1', model: 'gemini-2.0-flash', provider: 'gemini',
      prompt_preview: 'Resolve brand for: Razer Viper V3 Pro',
    }, { ts: '2026-03-16T00:00:06.000Z' }),
    makeEvent('llm_finished', {
      reason: 'brand_resolution', batch_id: 'br-1', model: 'gemini-2.0-flash', provider: 'gemini',
      tokens: { input: 320, output: 85 },
      response_preview: '{"brand":"Razer","official_domain":"razer.com"}',
    }, { ts: '2026-03-16T00:00:07.500Z' }),

    // -- LLM calls: search planner --
    makeEvent('llm_started', {
      reason: 'discovery_planner_primary', batch_id: 'sp-1', model: 'gemini-2.0-flash', provider: 'gemini',
      prompt_preview: 'Plan search queries for Razer Viper V3 Pro...',
    }, { ts: '2026-03-16T00:00:10.000Z' }),
    makeEvent('llm_finished', {
      reason: 'discovery_planner_primary', batch_id: 'sp-1', model: 'gemini-2.0-flash', provider: 'gemini',
      tokens: { input: 580, output: 210 },
      response_preview: '{"queries":["Razer Viper V3 Pro specs",...]}',
    }, { ts: '2026-03-16T00:00:12.000Z' }),

    // -- Search plan generated --
    makeEvent('search_plan_generated', {
      pass_index: 0,
      pass_name: 'primary',
      queries_generated: [
        'Razer Viper V3 Pro specifications',
        'Razer Viper V3 Pro weight dimensions',
        'Razer Viper V3 Pro user manual PDF',
        'Razer Viper V3 Pro rtings review',
      ],
      stop_condition: 'planner_complete',
      plan_rationale: 'Targeting core spec sources: manufacturer, manual, lab review',
      query_target_map: {
        'Razer Viper V3 Pro specifications': ['weight', 'sensor', 'dpi', 'dimensions'],
        'Razer Viper V3 Pro weight dimensions': ['weight', 'dimensions'],
        'Razer Viper V3 Pro user manual PDF': ['polling_rate', 'lod'],
        'Razer Viper V3 Pro rtings review': ['click_latency'],
      },
      missing_critical_fields: ['weight', 'dimensions', 'sensor', 'polling_rate', 'click_latency'],
      mode: 'standard',
    }, { ts: '2026-03-16T00:00:13.000Z' }),

    // -- Search execution: 4 queries --
    makeEvent('search_started', { query: 'Razer Viper V3 Pro specifications', provider: 'searxng', worker_id: 'w-1' }, { ts: '2026-03-16T00:00:15.000Z' }),
    makeEvent('search_finished', { query: 'Razer Viper V3 Pro specifications', provider: 'searxng', result_count: 12, worker_id: 'w-1' }, { ts: '2026-03-16T00:00:17.000Z' }),
    makeEvent('search_started', { query: 'Razer Viper V3 Pro weight dimensions', provider: 'searxng', worker_id: 'w-2' }, { ts: '2026-03-16T00:00:18.000Z' }),
    makeEvent('search_finished', { query: 'Razer Viper V3 Pro weight dimensions', provider: 'searxng', result_count: 8, worker_id: 'w-2' }, { ts: '2026-03-16T00:00:19.500Z' }),
    makeEvent('search_started', { query: 'Razer Viper V3 Pro user manual PDF', provider: 'searxng', worker_id: 'w-3' }, { ts: '2026-03-16T00:00:20.000Z' }),
    makeEvent('search_request_throttled', { query: 'Razer Viper V3 Pro user manual PDF', provider: 'searxng', key: '127.0.0.1', wait_ms: 250 }, { ts: '2026-03-16T00:00:20.500Z' }),
    makeEvent('search_finished', { query: 'Razer Viper V3 Pro user manual PDF', provider: 'searxng', result_count: 5, worker_id: 'w-3' }, { ts: '2026-03-16T00:00:21.500Z' }),
    makeEvent('search_started', { query: 'Razer Viper V3 Pro rtings review', provider: 'searxng', worker_id: 'w-4' }, { ts: '2026-03-16T00:00:22.000Z' }),
    makeEvent('search_finished', { query: 'Razer Viper V3 Pro rtings review', provider: 'searxng', result_count: 6, worker_id: 'w-4' }, { ts: '2026-03-16T00:00:23.000Z' }),

    // -- Search results collected --
    makeEvent('search_results_collected', {
      query: 'Razer Viper V3 Pro specifications',
      provider: 'searxng',
      dedupe_count: 2,
      results: [
        { title: 'Razer Viper V3 Pro - Official Specs', url: 'https://razer.com/viper-v3-pro', domain: 'razer.com', snippet: 'Official specifications page', rank: 1, relevance_score: 0.97, decision: 'keep', reason: 'manufacturer page' },
        { title: 'Viper V3 Pro Review | RTINGS', url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro', domain: 'rtings.com', snippet: 'Lab measurements and review', rank: 2, relevance_score: 0.88, decision: 'keep', reason: 'lab review' },
        { title: 'Amazon - Razer Viper V3 Pro', url: 'https://amazon.com/razer-viper-v3-pro', domain: 'amazon.com', snippet: 'Buy now', rank: 3, relevance_score: 0.25, decision: 'drop', reason: 'e-commerce, low spec content' },
      ],
    }, { ts: '2026-03-16T00:00:24.000Z' }),
    makeEvent('search_results_collected', {
      query: 'Razer Viper V3 Pro weight dimensions',
      provider: 'searxng',
      dedupe_count: 1,
      results: [
        { title: 'Razer Viper V3 Pro Technical Specs', url: 'https://razer.com/viper-v3-pro/tech-specs', domain: 'razer.com', snippet: 'Weight: 54g', rank: 1, relevance_score: 0.95, decision: 'keep', reason: 'manufacturer spec page' },
      ],
    }, { ts: '2026-03-16T00:00:24.500Z' }),

    // -- SERP triage --
    makeEvent('serp_selector_completed', {
      query: 'Razer Viper V3 Pro specifications',
      kept_count: 2,
      dropped_count: 1,
      candidates: [
        { url: 'https://razer.com/viper-v3-pro', title: 'Razer Viper V3 Pro - Official Specs', domain: 'razer.com', snippet: 'Official specs', score: 0.97, decision: 'keep', rationale: 'Manufacturer official page', score_components: { base_relevance: 0.85, tier_boost: 0.1, identity_match: 0.05, penalties: -0.03 } },
        { url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro', title: 'RTINGS Review', domain: 'rtings.com', snippet: 'Lab review', score: 0.88, decision: 'keep', rationale: 'Trusted lab review', score_components: { base_relevance: 0.78, tier_boost: 0.08, identity_match: 0.05, penalties: -0.03 } },
        { url: 'https://amazon.com/razer-viper-v3-pro', title: 'Amazon listing', domain: 'amazon.com', snippet: 'Buy', score: 0.15, decision: 'drop', rationale: 'E-commerce, no spec content', score_components: { base_relevance: 0.1, tier_boost: 0, identity_match: 0.05, penalties: 0 } },
      ],
    }, { ts: '2026-03-16T00:00:25.000Z' }),

    // -- LLM calls: SERP triage --
    makeEvent('llm_started', {
      reason: 'serp_selector_batch', batch_id: 'st-1', model: 'gemini-2.0-flash', provider: 'gemini',
    }, { ts: '2026-03-16T00:00:24.000Z' }),
    makeEvent('llm_finished', {
      reason: 'serp_selector_batch', batch_id: 'st-1', model: 'gemini-2.0-flash', provider: 'gemini',
      tokens: { input: 450, output: 180 },
    }, { ts: '2026-03-16T00:00:25.000Z' }),

    // -- Domain classification --
    makeEvent('domains_classified', {
      classifications: [
        { domain: 'razer.com', role: 'manufacturer', safety_class: 'safe', cooldown_remaining: 0, success_rate: 0.99, avg_latency_ms: 380, notes: 'Primary manufacturer domain' },
        { domain: 'support.razer.com', role: 'support', safety_class: 'safe', cooldown_remaining: 0, success_rate: 0.95, avg_latency_ms: 520, notes: 'Support subdomain' },
        { domain: 'rtings.com', role: 'lab_review', safety_class: 'safe', cooldown_remaining: 0, success_rate: 0.92, avg_latency_ms: 750, notes: 'Trusted lab review site' },
        { domain: 'amazon.com', role: 'e_commerce', safety_class: 'low_value', cooldown_remaining: 0, success_rate: 0.80, avg_latency_ms: 1200, notes: 'Low spec yield' },
      ],
    }, { ts: '2026-03-16T00:00:26.000Z' }),

    // -- LLM calls: domain classifier --
    makeEvent('llm_started', {
      reason: 'domain_safety_classification', batch_id: 'dc-1', model: 'gemini-2.0-flash', provider: 'gemini',
    }, { ts: '2026-03-16T00:00:25.500Z' }),
    makeEvent('llm_finished', {
      reason: 'domain_safety_classification', batch_id: 'dc-1', model: 'gemini-2.0-flash', provider: 'gemini',
      tokens: { input: 200, output: 90 },
    }, { ts: '2026-03-16T00:00:26.000Z' }),
  ];

  const artifacts = {
    search_profile: {
      query_count: 4,
      selected_query_count: 4,
      provider: 'searxng',
      llm_query_planning: true,
      llm_query_model: 'gemini-2.0-flash',
      llm_queries: ['Razer Viper V3 Pro specifications', 'Razer Viper V3 Pro weight dimensions'],
      identity_aliases: ['Razer Viper V3 Pro', 'RZ01-0490'],
      variant_guard_terms: ['wireless', 'wired', 'v2'],
      focus_fields: ['weight', 'dimensions', 'sensor', 'polling_rate', 'click_latency'],
      query_rows: [
        { query: 'Razer Viper V3 Pro specifications', target_fields: ['weight', 'sensor', 'dpi'], result_count: 12, providers: ['searxng'] },
        { query: 'Razer Viper V3 Pro weight dimensions', target_fields: ['weight', 'dimensions'], result_count: 8, providers: ['searxng'] },
        { query: 'Razer Viper V3 Pro user manual PDF', target_fields: ['polling_rate', 'lod'], result_count: 5, providers: ['searxng'] },
        { query: 'Razer Viper V3 Pro rtings review', target_fields: ['click_latency'], result_count: 6, providers: ['searxng'] },
      ],
      query_guard: { total: 4, guarded: 1 },
      field_rule_gate_counts: {
        'search_hints.query_terms': { value_count: 5, enabled_field_count: 3, disabled_field_count: 0, status: 'active' },
        'search_hints.domain_hints': { value_count: 3, enabled_field_count: 2, disabled_field_count: 0, status: 'active' },
      },
      field_rule_hint_counts_by_field: {
        weight: { query_terms: { value_count: 2, status: 'active' }, domain_hints: { value_count: 1, status: 'active' } },
        sensor: { query_terms: { value_count: 1, status: 'active' }, domain_hints: { value_count: 1, status: 'active' } },
      },
      generated_at: '2026-03-16T00:00:12.000Z',
      product_id: 'mouse-razer-viper-v3-pro',
      source: 'llm_planner',
    },
  };

  const result = buildPreFetchPhases(events, makeMeta(), artifacts);

  // ===== NEEDSET TAB =====
  assert.ok(result.needset, 'needset must be populated');
  assert.equal(result.needset.identity_state, 'locked');
  assert.equal(result.needset.round, 0);
  assert.equal(result.needset.schema_version, 'needset_planner_output.v2');
  assert.equal(result.needset.fields.length, 7, 'all 7 fields');
  assert.equal(result.needset.summary.total, 42);
  assert.equal(result.needset.summary.resolved, 18);
  assert.equal(result.needset.blockers.missing, 12);
  assert.equal(result.needset.blockers.weak, 7);
  assert.equal(result.needset.blockers.conflict, 3);
  assert.equal(result.needset.bundles.length, 3, 'all 3 bundles');
  assert.equal(result.needset.bundles[0].queries.length, 2);
  assert.equal(result.needset.bundles[0].phase, 'now');
  assert.equal(result.needset.bundles[0].priority, 'core');
  assert.equal(result.needset.bundles[1].priority, 'secondary');
  assert.equal(result.needset.bundles[2].priority, 'optional');
  assert.ok(result.needset.profile_influence, 'profile_influence must be populated');
  assert.equal(result.needset.profile_influence.total_queries, 4);
  assert.equal(result.needset.profile_influence.focused_bundles, 3);
  assert.equal(result.needset.deltas.length, 3, 'all 3 deltas');
  assert.equal(result.needset.snapshots.length, 1);

  // ===== SEARCH PROFILE TAB =====
  assert.ok(result.search_profile, 'search_profile must be populated');
  assert.equal(result.search_profile.query_count, 4);
  assert.equal(result.search_profile.provider, 'searxng');
  assert.equal(result.search_profile.llm_query_planning, true);
  assert.equal(result.search_profile.llm_query_model, 'gemini-2.0-flash');
  assert.deepEqual(result.search_profile.identity_aliases, ['Razer Viper V3 Pro', 'RZ01-0490']);
  assert.deepEqual(result.search_profile.variant_guard_terms, ['wireless', 'wired', 'v2']);
  assert.equal(result.search_profile.focus_fields.length, 5);
  assert.equal(result.search_profile.query_rows.length, 4);
  assert.equal(result.search_profile.query_rows[0].query, 'Razer Viper V3 Pro specifications');
  assert.equal(result.search_profile.query_guard.total, 4);
  assert.ok(result.search_profile.field_rule_gate_counts['search_hints.query_terms']);
  assert.equal(result.search_profile.field_rule_gate_counts['search_hints.query_terms'].value_count, 5);
  assert.ok(result.search_profile.field_rule_hint_counts_by_field.weight);
  assert.equal(result.search_profile.field_rule_hint_counts_by_field.weight.query_terms.value_count, 2);

  // ===== LLM CALLS =====
  assert.equal(result.llm_calls.brand_resolver.length, 1, 'brand resolver LLM call');
  assert.equal(result.llm_calls.brand_resolver[0].status, 'finished');
  assert.equal(result.llm_calls.brand_resolver[0].model, 'gemini-2.0-flash');
  assert.equal(result.llm_calls.brand_resolver[0].tokens.input, 320);
  assert.equal(result.llm_calls.brand_resolver[0].tokens.output, 85);
  assert.equal(result.llm_calls.brand_resolver[0].prompt_preview, 'Resolve brand for: Razer Viper V3 Pro');
  assert.ok(result.llm_calls.brand_resolver[0].duration_ms >= 0);

  assert.equal(result.llm_calls.search_planner.length, 1, 'search planner LLM call');
  assert.equal(result.llm_calls.search_planner[0].status, 'finished');
  assert.equal(result.llm_calls.search_planner[0].tokens.input, 580);

  assert.equal(result.llm_calls.serp_selector.length, 1, 'serp triage LLM call');
  assert.equal(result.llm_calls.serp_selector[0].status, 'finished');
  assert.equal(result.llm_calls.serp_selector[0].tokens.input, 450);

  assert.equal(result.llm_calls.domain_classifier.length, 1, 'domain classifier LLM call');
  assert.equal(result.llm_calls.domain_classifier[0].status, 'finished');
  assert.equal(result.llm_calls.domain_classifier[0].tokens.input, 200);

  // ===== BRAND RESOLUTION =====
  assert.ok(result.brand_resolution, 'brand_resolution must be populated');
  assert.equal(result.brand_resolution.brand, 'Razer');
  assert.equal(result.brand_resolution.status, 'resolved');
  assert.equal(result.brand_resolution.official_domain, 'razer.com');
  assert.deepEqual(result.brand_resolution.aliases, ['Razer Inc', 'Razer USA', 'RZ01-0490']);
  assert.equal(result.brand_resolution.support_domain, 'support.razer.com');
  assert.equal(result.brand_resolution.confidence, 0.97);
  assert.equal(result.brand_resolution.reasoning.length, 3);

  // ===== SEARCH PLANS =====
  assert.equal(result.search_plans.length, 1, 'search plan generated');
  assert.equal(result.search_plans[0].pass_name, 'primary');
  assert.equal(result.search_plans[0].queries_generated.length, 4);
  assert.equal(result.search_plans[0].stop_condition, 'planner_complete');
  assert.deepEqual(result.search_plans[0].missing_critical_fields, ['weight', 'dimensions', 'sensor', 'polling_rate', 'click_latency']);
  assert.equal(result.search_plans[0].mode, 'standard');
  assert.ok(result.search_plans[0].query_target_map['Razer Viper V3 Pro specifications']);

  // ===== SEARCH RESULTS =====
  assert.equal(result.search_results.length, 4, 'all 4 search queries');
  assert.equal(result.search_results[0].query, 'Razer Viper V3 Pro specifications');
  assert.equal(result.search_results[0].result_count, 12);
  assert.equal(result.search_results[0].provider, 'searxng');
  assert.ok(result.search_results[0].duration_ms >= 0);
  assert.equal(result.search_results[1].query, 'Razer Viper V3 Pro weight dimensions');
  assert.equal(result.search_results[1].result_count, 8);
  assert.equal(result.search_results[2].query, 'Razer Viper V3 Pro user manual PDF');
  assert.equal(result.search_results[2].result_count, 5);
  assert.equal(result.search_results[2].throttle_events, 1, 'throttle event captured');
  assert.equal(result.search_results[2].throttle_wait_ms, 250, 'throttle wait_ms captured');
  assert.equal(result.search_results[3].query, 'Razer Viper V3 Pro rtings review');
  assert.equal(result.search_results[3].result_count, 6);

  // ===== SEARCH RESULT DETAILS =====
  assert.equal(result.search_result_details.length, 2, 'search_results_collected events');
  assert.equal(result.search_result_details[0].query, 'Razer Viper V3 Pro specifications');
  assert.equal(result.search_result_details[0].dedupe_count, 2);
  assert.equal(result.search_result_details[0].results.length, 3);
  assert.equal(result.search_result_details[0].results[0].url, 'https://razer.com/viper-v3-pro');
  assert.equal(result.search_result_details[0].results[0].decision, 'keep');
  assert.equal(result.search_result_details[0].results[2].decision, 'drop');
  assert.equal(result.search_result_details[1].query, 'Razer Viper V3 Pro weight dimensions');

  // ===== CROSS-QUERY URL COUNTS =====
  assert.ok(result.cross_query_url_counts, 'cross_query_url_counts must be populated');
  assert.equal(result.cross_query_url_counts['https://razer.com/viper-v3-pro'], 1);
  assert.equal(result.cross_query_url_counts['https://razer.com/viper-v3-pro/tech-specs'], 1);

  // ===== SERP TRIAGE =====
  assert.equal(result.serp_selector.length, 1, 'serp triage completed');
  assert.equal(result.serp_selector[0].query, 'Razer Viper V3 Pro specifications');
  assert.equal(result.serp_selector[0].kept_count, 2);
  assert.equal(result.serp_selector[0].dropped_count, 1);
  assert.equal(result.serp_selector[0].candidates.length, 3);
  assert.equal(result.serp_selector[0].candidates[0].score, 0.97);
  assert.equal(result.serp_selector[0].candidates[0].score_components.base_relevance, 0.85);
  assert.equal(result.serp_selector[0].candidates[2].decision, 'drop');

  // ===== DOMAIN HEALTH =====
  assert.equal(result.domain_health.length, 4, 'all 4 domains classified');
  assert.equal(result.domain_health[0].domain, 'razer.com');
  assert.equal(result.domain_health[0].role, 'manufacturer');
  assert.equal(result.domain_health[0].safety_class, 'safe');
  assert.equal(result.domain_health[0].success_rate, 0.99);
  assert.equal(result.domain_health[0].avg_latency_ms, 380);
  assert.equal(result.domain_health[1].domain, 'support.razer.com');
  assert.equal(result.domain_health[2].domain, 'rtings.com');
  assert.equal(result.domain_health[2].role, 'lab_review');
  assert.equal(result.domain_health[3].domain, 'amazon.com');
  assert.equal(result.domain_health[3].safety_class, 'low_value');
});
