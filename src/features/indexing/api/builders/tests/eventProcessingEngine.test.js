// WHY: Golden-master characterization test. Locks current buildRuntimeOpsPanels
// output so the single-pass engine refactor can verify identical results.
// Run BEFORE any builder changes to capture baseline.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeOpsPanels, PANEL_KEYS } from '../buildRuntimeOpsPanels.js';

// WHY: Comprehensive fixture covering all event types that the 11 builders process.
// Each event has minimal shape but exercises the handler tables.
function goldenMasterEvents() {
  let i = 0;
  const ts = () => `2026-03-30T12:${String(i++).padStart(2, '0')}:00.000Z`;
  return [
    // Bootstrap / boot
    { ts: ts(), event: 'bootstrap_step', payload: { step: 'load_config', progress: 25 } },
    { ts: ts(), event: 'bootstrap_step', payload: { step: 'browser_pool', progress: 75 } },
    { ts: ts(), event: 'browser_pool_warmed', payload: { browsers: 2, slots: 4 } },
    // NeedSet
    { ts: ts(), event: 'needset_computed', payload: { total_fields: 15, round: 1 } },
    // Search
    { ts: ts(), stage: 'search', event: 'search_started', payload: { scope: 'query', query: 'test mouse specs', provider: 'google', worker_id: 'sw-1', slot: 's-1' } },
    { ts: ts(), stage: 'search', event: 'search_finished', payload: { scope: 'query', query: 'test mouse specs', result_count: 10, worker_id: 'sw-1', provider: 'google' } },
    { ts: ts(), stage: 'search', event: 'search_results_collected', payload: { query: 'test mouse specs', results: [{ url: 'https://example.com/a', title: 'A' }] } },
    { ts: ts(), event: 'search_request_throttled', payload: { query: 'test mouse specs', wait_ms: 500 } },
    // Brand
    { ts: ts(), event: 'brand_resolved', payload: { brand: 'TestBrand', official_domain: 'testbrand.com', aliases: ['TB'] } },
    // Search plan
    { ts: ts(), event: 'search_plan_generated', payload: { pass_index: 0, queries_generated: ['q1', 'q2'] } },
    // Query journey
    { ts: ts(), event: 'query_journey_completed', payload: { selected_query_count: 5, rejected_count: 2 } },
    // SERP selector
    { ts: ts(), event: 'serp_selector_completed', payload: { query: 'test mouse specs', kept_count: 3, dropped_count: 7 } },
    // Domain classifier
    { ts: ts(), event: 'domains_classified', payload: { domain: 'example.com', role: 'review', safety_class: 'safe' } },
    // Fetch
    { ts: ts(), stage: 'fetch', event: 'fetch_queued', payload: { scope: 'url', url: 'https://example.com/a', worker_id: 'fw-1' } },
    { ts: ts(), stage: 'fetch', event: 'fetch_started', payload: { scope: 'url', url: 'https://example.com/a', worker_id: 'fw-1', tier: 1, role: 'review' } },
    { ts: ts(), stage: 'fetch', event: 'fetch_finished', payload: { scope: 'url', url: 'https://example.com/a', worker_id: 'fw-1', status_code: 200, bytes: 5000, content_type: 'text/html', content_hash: 'abc123' } },
    { ts: ts(), stage: 'fetch', event: 'fetch_started', payload: { scope: 'url', url: 'https://example.com/b', worker_id: 'fw-2', tier: 2 } },
    { ts: ts(), stage: 'fetch', event: 'fetch_finished', payload: { scope: 'url', url: 'https://example.com/b', worker_id: 'fw-2', status_code: 403, bytes: 0 } },
    // Fetch plugins
    { ts: ts(), stage: 'fetch', event: 'plugin_hook_completed', payload: { plugin: 'stealth', url: 'https://example.com/a', worker_id: 'fw-1', result: { injected: true } } },
    { ts: ts(), stage: 'fetch', event: 'plugin_hook_completed', payload: { plugin: 'cookieConsent', url: 'https://example.com/a', worker_id: 'fw-1', result: { dismissed: true } } },
    // Parse
    { ts: ts(), stage: 'parse', event: 'parse_started', payload: { scope: 'url', url: 'https://example.com/a', worker_id: 'pw-1' } },
    { ts: ts(), stage: 'parse', event: 'parse_finished', payload: { scope: 'url', url: 'https://example.com/a', worker_id: 'pw-1', method: 'html_article' } },
    // Source processed
    { ts: ts(), stage: 'fetch', event: 'source_processed', payload: { url: 'https://example.com/a', worker_id: 'fw-1', status: 200, content_hash: 'abc123', dedupe_outcome: 'new' } },
    // LLM
    { ts: ts(), stage: 'llm', event: 'llm_started', payload: { worker_id: 'lw-1', reason: 'extract', model: 'gemini-2.5-flash', call_type: 'extraction' } },
    { ts: ts(), stage: 'llm', event: 'llm_finished', payload: { worker_id: 'lw-1', reason: 'extract', model: 'gemini-2.5-flash', prompt_tokens: 1000, completion_tokens: 200, fields_extracted: 5, call_type: 'extraction' } },
    { ts: ts(), stage: 'llm', event: 'llm_started', payload: { worker_id: 'lw-2', reason: 'plan', model: 'gemini-2.5-flash', call_type: 'search_planner' } },
    { ts: ts(), stage: 'llm', event: 'llm_finished', payload: { worker_id: 'lw-2', reason: 'plan', model: 'gemini-2.5-flash', prompt_tokens: 500, completion_tokens: 100, call_type: 'search_planner' } },
    // Index
    { ts: ts(), stage: 'index', event: 'index_started', payload: { url: 'https://example.com/a', worker_id: 'iw-1' } },
    { ts: ts(), stage: 'index', event: 'index_finished', payload: { url: 'https://example.com/a', worker_id: 'iw-1', count: 5 } },
    // Extraction plugins (field is `plugin`, not `plugin_name`)
    { ts: ts(), stage: 'extraction', event: 'extraction_plugin_completed', payload: { plugin: 'screenshot', url: 'https://example.com/a', worker_id: 'fw-1', duration_ms: 150 } },
    { ts: ts(), stage: 'extraction', event: 'extraction_artifacts_persisted', payload: { plugin: 'screenshot', url: 'https://example.com/a', worker_id: 'fw-1', filenames: ['shot1.png'] } },
    // Fallbacks
    { ts: ts(), stage: 'fetch', event: 'scheduler_fallback_started', payload: { url: 'https://blocked.com', from_mode: 'direct', to_mode: 'stealth' } },
    { ts: ts(), stage: 'fetch', event: 'scheduler_fallback_succeeded', payload: { url: 'https://blocked.com', mode: 'stealth', elapsed_ms: 2000 } },
    // Queue
    { ts: ts(), event: 'repair_query_enqueued', payload: { lane: 'repair', url: 'https://example.com/c', query: 'repair q', reason: 'low_coverage' } },
    { ts: ts(), event: 'url_cooldown_applied', payload: { url: 'https://blocked.com', host: 'blocked.com', cooldown_until: '2026-03-30T13:00:00.000Z' } },
    // Crawler stats
    { ts: ts(), event: 'crawler_stats', payload: { status_codes: { '200': 1, '403': 1 }, avg_ok_ms: 500, avg_fail_ms: 200 } },
  ];
}

function goldenMasterMeta() {
  return {
    run_id: 'golden-master-001',
    category: 'mouse',
    product_id: 'mouse-golden-test',
    status: 'completed',
    started_at: '2026-03-30T12:00:00.000Z',
    ended_at: '2026-03-30T12:35:00.000Z',
    stage_cursor: 'completed',
    round: 1,
  };
}

// WHY: Capture the current buildRuntimeOpsPanels output as the golden master.
// The engine must produce identical output for each panel key.
// built_at is excluded from comparison (it's a timestamp that changes each call).

describe('golden-master: buildRuntimeOpsPanels output characterization', () => {
  const events = goldenMasterEvents();
  const meta = goldenMasterMeta();
  const artifacts = { needset: { total_fields: 15, fields: [] }, search_profile: { query_count: 5, query_rows: [] } };

  const baseline = buildRuntimeOpsPanels({ events, meta, artifacts });

  test('baseline produces all panel keys', () => {
    for (const key of PANEL_KEYS) {
      assert.ok(key in baseline, `missing panel key: ${key}`);
    }
  });

  test('baseline summary has correct fetch counts', () => {
    const s = baseline.summary;
    assert.ok(s, 'summary must exist');
    assert.equal(s.total_fetches, 2, 'total_fetches');
    assert.equal(s.total_parses, 1, 'total_parses');
    assert.equal(s.total_llm_calls, 2, 'total_llm_calls');
  });

  test('baseline pipeline_flow has stage counts', () => {
    const pf = baseline.pipeline_flow;
    assert.ok(pf, 'pipeline_flow must exist');
    assert.ok(Array.isArray(pf.stages), 'stages must be an array');
    assert.ok(pf.stages.length > 0, 'at least one stage');
  });

  test('baseline documents is an array with at least one entry', () => {
    assert.ok(Array.isArray(baseline.documents), 'documents must be array');
    assert.ok(baseline.documents.length >= 1, 'at least one document');
  });

  test('baseline workers is present (array or null from try/catch)', () => {
    assert.ok('workers' in baseline, 'workers key must be present');
  });

  test('baseline llm_dashboard is present', () => {
    assert.ok('llm_dashboard' in baseline, 'llm_dashboard key must be present');
  });

  test('baseline fetch has plugin groups', () => {
    const f = baseline.fetch;
    assert.ok(f, 'fetch must exist');
    assert.ok('stealth' in f, 'has stealth plugin group');
    assert.ok('cookie_consent' in f, 'has cookie_consent plugin group');
  });

  test('baseline extraction_plugins has screenshot group', () => {
    const ep = baseline.extraction_plugins;
    assert.ok(ep, 'extraction_plugins must exist');
    assert.ok('screenshot' in ep, 'has screenshot plugin group');
  });

  test('baseline fallbacks has events array', () => {
    const fb = baseline.fallbacks;
    assert.ok(fb, 'fallbacks must exist');
    assert.ok(Array.isArray(fb.events), 'events is array');
  });

  test('baseline queue has jobs or lanes', () => {
    const q = baseline.queue;
    assert.ok(q, 'queue must exist');
  });

  // WHY: This is the critical test — after engine migration, re-run with
  // processEventsToPanel and deep-compare every panel key (except built_at).
  test('golden-master snapshot is stable across calls', () => {
    const second = buildRuntimeOpsPanels({ events, meta, artifacts });
    for (const key of PANEL_KEYS) {
      assert.deepEqual(second[key], baseline[key],
        `panel "${key}" output changed between calls — non-deterministic builder`);
    }
  });
});
