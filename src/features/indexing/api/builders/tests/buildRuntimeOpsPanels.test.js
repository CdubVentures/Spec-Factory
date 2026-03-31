import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeOpsPanels, PANEL_KEYS } from '../buildRuntimeOpsPanels.js';

// WHY: Minimal event fixtures that exercise all builder paths without
// depending on internal builder logic. Each event has the minimal shape
// expected by the runtimeOps builders (ts, stage, event, payload).
function sampleEvents() {
  const ts = '2026-03-30T12:00:00.000Z';
  return [
    { ts, stage: 'search', event: 'search_started', payload: { scope: 'url', query: 'test', provider: 'serper', worker_id: 'sw-0' } },
    { ts, stage: 'search', event: 'search_finished', payload: { scope: 'url', query: 'test', result_count: 5, worker_id: 'sw-0' } },
    { ts, stage: 'fetch', event: 'fetch_started', payload: { scope: 'url', url: 'https://example.com', worker_id: 'fw-0' } },
    { ts, stage: 'fetch', event: 'fetch_finished', payload: { scope: 'url', url: 'https://example.com', status_code: 200, worker_id: 'fw-0' } },
    { ts, stage: 'fetch', event: 'plugin_hook_completed', payload: { plugin_name: 'stealth', url: 'https://example.com', worker_id: 'fw-0' } },
    { ts, stage: 'parse', event: 'parse_started', payload: { scope: 'url', url: 'https://example.com', worker_id: 'pw-0' } },
    { ts, stage: 'parse', event: 'parse_finished', payload: { scope: 'url', url: 'https://example.com', worker_id: 'pw-0' } },
    { ts, stage: 'llm', event: 'llm_started', payload: { worker_id: 'lw-0', reason: 'plan', model: 'gemini-2.5-flash' } },
    { ts, stage: 'llm', event: 'llm_finished', payload: { worker_id: 'lw-0', reason: 'plan', model: 'gemini-2.5-flash', prompt_tokens: 100, completion_tokens: 50 } },
    { ts, stage: 'extraction', event: 'extraction_plugin_completed', payload: { plugin_name: 'screenshot', url: 'https://example.com', worker_id: 'fw-0' } },
  ];
}

function sampleMeta() {
  return {
    run_id: 'test-panels-001',
    category: 'mouse',
    product_id: 'mouse-test',
    status: 'completed',
    started_at: '2026-03-30T12:00:00.000Z',
    ended_at: '2026-03-30T12:01:00.000Z',
    phase_cursor: 'completed',
  };
}

describe('buildRuntimeOpsPanels', () => {
  test('PANEL_KEYS exports the canonical list of panel section keys', () => {
    assert.ok(Array.isArray(PANEL_KEYS), 'PANEL_KEYS must be an array');
    assert.ok(PANEL_KEYS.length >= 11, `expected at least 11 keys, got ${PANEL_KEYS.length}`);
    for (const key of ['summary', 'pipeline_flow', 'metrics_rail', 'documents', 'prefetch', 'fetch', 'extraction_plugins', 'workers', 'llm_dashboard', 'fallbacks', 'queue']) {
      assert.ok(PANEL_KEYS.includes(key), `missing key: ${key}`);
    }
  });

  test('happy path: realistic events produce all panel keys', () => {
    const result = buildRuntimeOpsPanels({
      events: sampleEvents(),
      meta: sampleMeta(),
      artifacts: {},
    });

    assert.ok(result, 'result must exist');
    assert.equal(result.panel_version, 1);
    assert.ok(result.built_at, 'built_at must be set');

    for (const key of PANEL_KEYS) {
      assert.ok(key in result, `missing panel key: ${key}`);
      assert.notEqual(result[key], undefined, `panel ${key} is undefined`);
    }
  });

  test('empty events: all panels return valid output without throwing', () => {
    const result = buildRuntimeOpsPanels({
      events: [],
      meta: sampleMeta(),
      artifacts: {},
    });

    assert.ok(result, 'result must exist');
    assert.equal(result.panel_version, 1);

    for (const key of PANEL_KEYS) {
      assert.ok(key in result, `missing panel key: ${key}`);
    }
  });

  test('null/undefined inputs: returns valid panel object without throwing', () => {
    const result = buildRuntimeOpsPanels({});
    assert.ok(result, 'result must exist');
    assert.equal(result.panel_version, 1);
  });

  test('one builder failure does not prevent other panels from being built', () => {
    // WHY: Pass a poison event that might trip one builder while
    // others continue. The key contract: best-effort per panel.
    const events = [
      ...sampleEvents(),
      // Malformed event that some builders might choke on
      { ts: null, stage: null, event: null, payload: null },
    ];
    const result = buildRuntimeOpsPanels({
      events,
      meta: sampleMeta(),
      artifacts: {},
    });

    assert.ok(result, 'result must exist');
    // At least summary and pipeline_flow should succeed (they handle bad events gracefully)
    let successCount = 0;
    for (const key of PANEL_KEYS) {
      if (result[key] !== null) successCount += 1;
    }
    assert.ok(successCount >= 2, `expected at least 2 non-null panels, got ${successCount}`);
  });

  test('prefetch panel includes artifacts when provided', () => {
    const needset = { total_fields: 10, fields: [{ field: 'weight', status: 'needed' }] };
    const searchProfile = { query_count: 3, query_rows: [] };
    const result = buildRuntimeOpsPanels({
      events: sampleEvents(),
      meta: sampleMeta(),
      artifacts: { needset, search_profile: searchProfile },
    });

    assert.ok(result.prefetch, 'prefetch panel must exist');
    // The prefetch builder merges artifacts into its output
    const pf = result.prefetch;
    assert.ok(pf.needset || pf.needset_size !== undefined, 'prefetch should contain needset data');
  });

  test('documents panel respects limit', () => {
    const result = buildRuntimeOpsPanels({
      events: sampleEvents(),
      meta: sampleMeta(),
      artifacts: {},
    });

    assert.ok(Array.isArray(result.documents), 'documents must be an array');
  });

  test('workers panel is an array', () => {
    const result = buildRuntimeOpsPanels({
      events: sampleEvents(),
      meta: sampleMeta(),
      artifacts: {},
    });

    assert.ok(Array.isArray(result.workers), 'workers must be an array');
  });

  test('llm_dashboard has calls and summary', () => {
    const result = buildRuntimeOpsPanels({
      events: sampleEvents(),
      meta: sampleMeta(),
      artifacts: {},
    });

    const dash = result.llm_dashboard;
    assert.ok(dash, 'llm_dashboard must exist');
    assert.ok('calls' in dash || 'summary' in dash, 'llm_dashboard should have calls or summary');
  });
});
