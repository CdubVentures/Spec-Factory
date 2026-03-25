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
    events.push(makeEvent('plugin_hook_completed', {
      plugin: 'stealth',
      hook: 'beforeNavigate',
      worker_id: fw.worker_id,
      result: { patches: ['webdriver', 'plugins', 'languages'], injected: true },
    }, { ts: fw.ts ?? '2026-02-20T00:01:00.000Z' }));
  }
  return events;
}

test('buildFetchPhases: empty events returns baseline shape', () => {
  const result = buildFetchPhases([]);
  assert.ok(result && typeof result === 'object');
  assert.ok(result.stealth && typeof result.stealth === 'object');
  assert.ok(Array.isArray(result.stealth.patches));
  assert.ok(result.stealth.patches.length > 0, 'patches should include known stealth patches');
  assert.ok(Array.isArray(result.stealth.injections));
  assert.equal(result.stealth.injections.length, 0);
  assert.equal(result.stealth.total_injected, 0);
  assert.equal(result.stealth.total_failed, 0);
});

test('buildFetchPhases: accumulates stealth plugin_hook_completed events', () => {
  const events = [
    makeEvent('plugin_hook_completed', {
      plugin: 'stealth',
      hook: 'beforeNavigate',
      worker_id: 'fetch-1',
      result: { patches: ['webdriver', 'plugins', 'languages'], injected: true },
    }),
    makeEvent('plugin_hook_completed', {
      plugin: 'stealth',
      hook: 'beforeNavigate',
      worker_id: 'fetch-2',
      result: { patches: ['webdriver', 'plugins', 'languages'], injected: true },
    }, { ts: '2026-02-20T00:02:00.000Z' }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.stealth.injections.length, 2);
  assert.equal(result.stealth.total_injected, 2);
  assert.equal(result.stealth.total_failed, 0);
});

test('buildFetchPhases: counts failed injections', () => {
  const events = [
    makeEvent('plugin_hook_completed', {
      plugin: 'stealth',
      hook: 'beforeNavigate',
      worker_id: 'fetch-1',
      result: { patches: ['webdriver', 'plugins', 'languages'], injected: true },
    }),
    makeEvent('plugin_hook_completed', {
      plugin: 'stealth',
      hook: 'beforeNavigate',
      worker_id: 'fetch-3',
      result: { patches: ['webdriver', 'plugins', 'languages'], injected: false },
    }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.stealth.total_injected, 1);
  assert.equal(result.stealth.total_failed, 1);
});

test('buildFetchPhases: stealth ignores non-stealth plugin events', () => {
  const events = [
    makeEvent('plugin_hook_completed', {
      plugin: 'autoScroll',
      hook: 'onInteract',
      worker_id: 'fetch-1',
      result: { enabled: true, passes: 3, delayMs: 0, postLoadWaitMs: 200 },
    }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.stealth.injections.length, 0);
});

test('buildFetchPhases: ignores non-plugin events entirely', () => {
  const events = [
    makeEvent('fetch_started', { url: 'http://example.com', worker_id: 'fetch-1' }),
    makeEvent('source_processed', { url: 'http://example.com', status: 200 }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.stealth.injections.length, 0);
  assert.equal(result.stealth.total_injected, 0);
});

test('buildFetchPhases: resolves display_label from search slot assignment', () => {
  const events = makeSearchAndFetchEvents({
    slot: 'a',
    query: 'lenovo thinkpad specs',
    results: [
      { url: 'https://lenovo.com/specs', rank: 1 },
      { url: 'https://lenovo.com/support', rank: 3 },
    ],
    fetchWorkers: [
      { worker_id: 'fetch-1', url: 'https://lenovo.com/specs', ts: '2026-02-20T00:01:00.000Z' },
      { worker_id: 'fetch-2', url: 'https://lenovo.com/support', ts: '2026-02-20T00:01:01.000Z' },
    ],
  });
  const result = buildFetchPhases(events);
  assert.equal(result.stealth.injections.length, 2);
  assert.equal(result.stealth.injections[0].display_label, 'fetch-a1');
  assert.equal(result.stealth.injections[0].url, 'https://lenovo.com/specs');
  assert.equal(result.stealth.injections[0].host, 'lenovo.com');
  assert.equal(result.stealth.injections[1].display_label, 'fetch-a3');
  assert.equal(result.stealth.injections[1].url, 'https://lenovo.com/support');
});

test('buildFetchPhases: falls back to worker_id when no search assignment exists', () => {
  const events = [
    makeEvent('fetch_started', {
      worker_id: 'fetch-1',
      url: 'https://orphan.com/page',
      host: 'orphan.com',
    }),
    makeEvent('plugin_hook_completed', {
      plugin: 'stealth',
      hook: 'beforeNavigate',
      worker_id: 'fetch-1',
      result: { patches: ['webdriver', 'plugins', 'languages'], injected: true },
    }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.stealth.injections[0].display_label, 'fetch-1');
  assert.equal(result.stealth.injections[0].url, 'https://orphan.com/page');
  assert.equal(result.stealth.injections[0].host, 'orphan.com');
});

// ── auto_scroll ──────────────────────────────────────────────────────────────

test('buildFetchPhases: empty events returns auto_scroll baseline shape', () => {
  const result = buildFetchPhases([]);
  assert.ok(result.auto_scroll && typeof result.auto_scroll === 'object');
  assert.ok(Array.isArray(result.auto_scroll.scroll_records));
  assert.equal(result.auto_scroll.scroll_records.length, 0);
  assert.equal(result.auto_scroll.total_scrolled, 0);
  assert.equal(result.auto_scroll.total_skipped, 0);
});

test('buildFetchPhases: accumulates autoScroll plugin_hook_completed events', () => {
  const events = [
    makeEvent('fetch_started', { worker_id: 'fetch-1', url: 'https://example.com', host: 'example.com' }),
    makeEvent('plugin_hook_completed', {
      plugin: 'autoScroll',
      hook: 'onInteract',
      worker_id: 'fetch-1',
      result: { enabled: true, passes: 3, delayMs: 100, postLoadWaitMs: 200 },
    }),
    makeEvent('fetch_started', { worker_id: 'fetch-2', url: 'https://other.com', host: 'other.com' }),
    makeEvent('plugin_hook_completed', {
      plugin: 'autoScroll',
      hook: 'onInteract',
      worker_id: 'fetch-2',
      result: { enabled: true, passes: 5, delayMs: 0, postLoadWaitMs: 200 },
    }, { ts: '2026-02-20T00:02:00.000Z' }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.auto_scroll.scroll_records.length, 2);
  assert.equal(result.auto_scroll.total_scrolled, 2);
  assert.equal(result.auto_scroll.total_skipped, 0);
  assert.equal(result.auto_scroll.scroll_records[0].passes, 3);
  assert.equal(result.auto_scroll.scroll_records[0].enabled, true);
  assert.equal(result.auto_scroll.scroll_records[1].passes, 5);
});

test('buildFetchPhases: counts skipped auto-scroll workers', () => {
  const events = [
    makeEvent('fetch_started', { worker_id: 'fetch-1', url: 'https://example.com', host: 'example.com' }),
    makeEvent('plugin_hook_completed', {
      plugin: 'autoScroll',
      hook: 'onInteract',
      worker_id: 'fetch-1',
      result: { enabled: false, passes: 0, delayMs: 0, postLoadWaitMs: 0 },
    }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.auto_scroll.total_scrolled, 0);
  assert.equal(result.auto_scroll.total_skipped, 1);
  assert.equal(result.auto_scroll.scroll_records[0].enabled, false);
});

test('buildFetchPhases: auto_scroll records include display_label from search assignment', () => {
  const events = makeSearchAndFetchEvents({
    slot: 'b',
    query: 'test product specs',
    results: [{ url: 'https://example.com/specs', rank: 2 }],
    fetchWorkers: [{ worker_id: 'fetch-1', url: 'https://example.com/specs' }],
  });
  // Add autoScroll event for the same worker
  events.push(makeEvent('plugin_hook_completed', {
    plugin: 'autoScroll',
    hook: 'onInteract',
    worker_id: 'fetch-1',
    result: { enabled: true, passes: 3, delayMs: 0, postLoadWaitMs: 200 },
  }));
  const result = buildFetchPhases(events);
  assert.equal(result.auto_scroll.scroll_records[0].display_label, 'fetch-b2');
  assert.equal(result.auto_scroll.scroll_records[0].host, 'example.com');
});

// ── dom_expansion ────────────────────────────────────────────────────────────

test('buildFetchPhases: empty events returns dom_expansion baseline shape', () => {
  const result = buildFetchPhases([]);
  assert.ok(result.dom_expansion && typeof result.dom_expansion === 'object');
  assert.ok(Array.isArray(result.dom_expansion.expansion_records));
  assert.equal(result.dom_expansion.expansion_records.length, 0);
  assert.equal(result.dom_expansion.total_expanded, 0);
  assert.equal(result.dom_expansion.total_skipped, 0);
  assert.equal(result.dom_expansion.total_clicks, 0);
  assert.equal(result.dom_expansion.total_found, 0);
});

test('buildFetchPhases: accumulates domExpansion events', () => {
  const events = [
    makeEvent('fetch_started', { worker_id: 'fetch-1', url: 'https://example.com', host: 'example.com' }),
    makeEvent('plugin_hook_completed', {
      plugin: 'domExpansion',
      hook: 'onInteract',
      worker_id: 'fetch-1',
      result: { enabled: true, selectors: ['.show-more'], found: 5, clicked: 4, settleMs: 1500 },
    }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.dom_expansion.expansion_records.length, 1);
  assert.equal(result.dom_expansion.total_expanded, 1);
  assert.equal(result.dom_expansion.total_skipped, 0);
  assert.equal(result.dom_expansion.total_clicks, 4);
  assert.equal(result.dom_expansion.total_found, 5);
  assert.equal(result.dom_expansion.expansion_records[0].clicked, 4);
});

test('buildFetchPhases: counts skipped dom-expansion workers', () => {
  const events = [
    makeEvent('fetch_started', { worker_id: 'fetch-1', url: 'https://example.com', host: 'example.com' }),
    makeEvent('plugin_hook_completed', {
      plugin: 'domExpansion',
      hook: 'onInteract',
      worker_id: 'fetch-1',
      result: { enabled: false, selectors: [], found: 0, clicked: 0, settleMs: 0 },
    }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.dom_expansion.total_expanded, 0);
  assert.equal(result.dom_expansion.total_skipped, 1);
});

// ── css_override ─────────────────────────────────────────────────────────────

test('buildFetchPhases: empty events returns css_override baseline shape', () => {
  const result = buildFetchPhases([]);
  assert.ok(result.css_override && typeof result.css_override === 'object');
  assert.ok(Array.isArray(result.css_override.override_records));
  assert.equal(result.css_override.override_records.length, 0);
  assert.equal(result.css_override.total_overridden, 0);
  assert.equal(result.css_override.total_skipped, 0);
  assert.equal(result.css_override.total_elements_revealed, 0);
});

test('buildFetchPhases: accumulates cssOverride events', () => {
  const events = [
    makeEvent('fetch_started', { worker_id: 'fetch-1', url: 'https://example.com', host: 'example.com' }),
    makeEvent('plugin_hook_completed', {
      plugin: 'cssOverride',
      hook: 'onInteract',
      worker_id: 'fetch-1',
      result: { enabled: true, hiddenBefore: 12, revealedAfter: 12 },
    }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.css_override.override_records.length, 1);
  assert.equal(result.css_override.total_overridden, 1);
  assert.equal(result.css_override.total_skipped, 0);
  assert.equal(result.css_override.total_elements_revealed, 12);
  assert.equal(result.css_override.override_records[0].hiddenBefore, 12);
});

test('buildFetchPhases: counts skipped css-override workers', () => {
  const events = [
    makeEvent('plugin_hook_completed', {
      plugin: 'cssOverride',
      hook: 'onInteract',
      worker_id: 'fetch-1',
      result: { enabled: false, hiddenBefore: 0, revealedAfter: 0 },
    }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.css_override.total_overridden, 0);
  assert.equal(result.css_override.total_skipped, 1);
});
