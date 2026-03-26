import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFetchPhases } from '../runtimeOpsFetchBuilders.js';

function makeEvent(event, payload = {}, overrides = {}) {
  return {
    run_id: 'run-001',
    ts: '2026-02-20T00:01:00.000Z',
    event,
    payload,
    ...overrides,
  };
}

function makePluginEvent(plugin, result, workerId = 'fetch-1', overrides = {}) {
  return makeEvent('plugin_hook_completed', {
    plugin,
    hook: 'onInteract',
    worker_id: workerId,
    result,
  }, overrides);
}

// WHY: Simulates the real event sequence — search discovers URLs, then fetch workers
// get assigned those URLs. The display_label is derived from search slot + SERP rank.
function makeSearchAndFetchEvents({ slot = 'a', query = 'test query', results = [], fetchWorkers = [] } = {}) {
  const events = [];
  events.push(makeEvent('search_started', {
    scope: 'query',
    worker_id: `search-${slot}`,
    query,
    slot,
  }, { ts: '2026-02-20T00:00:30.000Z' }));
  events.push(makeEvent('search_results_collected', {
    scope: 'query',
    query,
    provider: 'google',
    results: results.map((r, i) => ({ url: r.url, rank: r.rank ?? i + 1 })),
  }, { ts: '2026-02-20T00:00:31.000Z' }));
  for (const fw of fetchWorkers) {
    events.push(makeEvent('fetch_started', {
      worker_id: fw.worker_id,
      url: fw.url,
      host: new URL(fw.url).hostname,
    }, { ts: fw.ts ?? '2026-02-20T00:01:00.000Z' }));
  }
  return events;
}

// ── 1. Empty events ────────────────────────────────────────────────────────

test('returns empty object for empty events array', () => {
  const result = buildFetchPhases([]);
  assert.deepStrictEqual(result, {});
});

// ── 2. Non-matching event types ignored ────────────────────────────────────

test('ignores events that are not plugin_hook_completed', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://example.com', worker_id: 'fetch-1' }),
    makeEvent('source_processed', { url: 'https://example.com', status: 200 }),
  ];
  const result = buildFetchPhases(events);
  assert.deepStrictEqual(result, {});
});

// ── 3. Single plugin, single event ─────────────────────────────────────────

test('groups a single plugin_hook_completed event', () => {
  const events = [
    makePluginEvent('stealth', { patches: ['webdriver'], injected: true }),
  ];
  const result = buildFetchPhases(events);
  assert.ok(result.stealth);
  assert.equal(result.stealth.records.length, 1);
  assert.equal(result.stealth.total, 1);
  assert.equal(result.stealth.records[0].worker_id, 'fetch-1');
});

// ── 4. Multiple events same plugin ─────────────────────────────────────────

test('accumulates multiple events for the same plugin', () => {
  const events = [
    makePluginEvent('stealth', { injected: true }, 'fetch-1'),
    makePluginEvent('stealth', { injected: false }, 'fetch-2'),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.stealth.records.length, 2);
  assert.equal(result.stealth.total, 2);
});

// ── 5. Multiple plugins auto-grouped ───────────────────────────────────────

test('groups events by plugin name into separate keys', () => {
  const events = [
    makePluginEvent('stealth', { injected: true }, 'fetch-1'),
    makePluginEvent('autoScroll', { enabled: true, passes: 3 }, 'fetch-1'),
    makePluginEvent('stealth', { injected: true }, 'fetch-2'),
  ];
  const result = buildFetchPhases(events);
  assert.equal(Object.keys(result).length, 2);
  assert.equal(result.stealth.total, 2);
  assert.equal(result.auto_scroll.total, 1);
});

// ── 6. Unknown future plugin auto-grouped ──────────────────────────────────

test('auto-groups an unknown plugin name without requiring code changes', () => {
  const events = [
    makePluginEvent('videoCapture', { enabled: true, frames: 120 }, 'fetch-1'),
  ];
  const result = buildFetchPhases(events);
  assert.ok(result.video_capture);
  assert.equal(result.video_capture.total, 1);
  assert.equal(result.video_capture.records[0].frames, 120);
});

// ── 7. Empty plugin name skipped ───────────────────────────────────────────

test('skips events with empty or missing plugin name', () => {
  const events = [
    makePluginEvent('', { injected: true }),
    makePluginEvent(undefined, { injected: true }),
  ];
  const result = buildFetchPhases(events);
  assert.deepStrictEqual(result, {});
});

// ── 8. Raw result fields preserved (spread into record) ────────────────────

test('spreads raw result fields into each record', () => {
  const events = [
    makePluginEvent('stealth', { patches: ['webdriver', 'plugins'], injected: true }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.stealth.records[0].injected, true);
  assert.deepStrictEqual(result.stealth.records[0].patches, ['webdriver', 'plugins']);
});

test('preserves autoScroll result fields', () => {
  const events = [
    makeEvent('fetch_started', { worker_id: 'fetch-1', url: 'https://example.com', host: 'example.com' }),
    makePluginEvent('autoScroll', { enabled: true, passes: 3, delayMs: 100, postLoadWaitMs: 200 }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.auto_scroll.records[0].enabled, true);
  assert.equal(result.auto_scroll.records[0].passes, 3);
  assert.equal(result.auto_scroll.records[0].delayMs, 100);
  assert.equal(result.auto_scroll.records[0].postLoadWaitMs, 200);
});

test('preserves domExpansion result fields', () => {
  const events = [
    makeEvent('fetch_started', { worker_id: 'fetch-1', url: 'https://example.com', host: 'example.com' }),
    makePluginEvent('domExpansion', { enabled: true, selectors: ['.show-more'], found: 5, clicked: 4, settleMs: 1500 }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.dom_expansion.records[0].clicked, 4);
  assert.equal(result.dom_expansion.records[0].found, 5);
  assert.deepStrictEqual(result.dom_expansion.records[0].selectors, ['.show-more']);
});

test('preserves cssOverride result fields', () => {
  const events = [
    makePluginEvent('cssOverride', { enabled: true, hiddenBefore: 12, revealedAfter: 12 }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.css_override.records[0].hiddenBefore, 12);
  assert.equal(result.css_override.records[0].revealedAfter, 12);
});

// ── 9. Worker display labels resolved ──────────────────────────────────────

test('resolves display_label from search slot assignment', () => {
  const events = makeSearchAndFetchEvents({
    slot: 'a',
    query: 'lenovo thinkpad specs',
    results: [
      { url: 'https://lenovo.com/specs', rank: 1 },
      { url: 'https://lenovo.com/support', rank: 3 },
    ],
    fetchWorkers: [
      { worker_id: 'fetch-1', url: 'https://lenovo.com/specs' },
      { worker_id: 'fetch-2', url: 'https://lenovo.com/support' },
    ],
  });
  events.push(makePluginEvent('stealth', { injected: true }, 'fetch-1'));
  events.push(makePluginEvent('stealth', { injected: true }, 'fetch-2'));
  const result = buildFetchPhases(events);
  assert.equal(result.stealth.records[0].display_label, 'fetch-a1');
  assert.equal(result.stealth.records[0].url, 'https://lenovo.com/specs');
  assert.equal(result.stealth.records[0].host, 'lenovo.com');
  assert.equal(result.stealth.records[1].display_label, 'fetch-a3');
});

test('falls back to worker_id when no search assignment exists', () => {
  const events = [
    makeEvent('fetch_started', { worker_id: 'fetch-1', url: 'https://orphan.com/page', host: 'orphan.com' }),
    makePluginEvent('stealth', { injected: true }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.stealth.records[0].display_label, 'fetch-1');
  assert.equal(result.stealth.records[0].url, 'https://orphan.com/page');
  assert.equal(result.stealth.records[0].host, 'orphan.com');
});
