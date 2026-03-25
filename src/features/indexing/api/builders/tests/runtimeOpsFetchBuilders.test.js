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
    events.push(makeEvent('source_fetch_started', {
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

test('buildFetchPhases: ignores non-stealth plugin events', () => {
  const events = [
    makeEvent('plugin_hook_completed', {
      plugin: 'autoScroll',
      hook: 'onInteract',
      worker_id: 'fetch-1',
      result: { scrolled: true },
    }),
  ];
  const result = buildFetchPhases(events);
  assert.equal(result.stealth.injections.length, 0);
});

test('buildFetchPhases: ignores non-plugin events entirely', () => {
  const events = [
    makeEvent('source_fetch_started', { url: 'http://example.com', worker_id: 'fetch-1' }),
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
    makeEvent('source_fetch_started', {
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
