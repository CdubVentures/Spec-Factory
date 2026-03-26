import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExtractionPluginPhases } from '../runtimeOpsExtractionPluginBuilders.js';

function makeEvent(event, payload = {}) {
  return { event, ts: '2026-03-25T12:00:00.000Z', payload };
}

function makeExtractionEvent(plugin, url, workerId) {
  return makeEvent('extraction_plugin_completed', { plugin, url, worker_id: workerId });
}

// ── 1. Empty events ────────────────────────────────────────────────────────

test('returns empty object for empty events array', () => {
  const result = buildExtractionPluginPhases([]);
  assert.deepStrictEqual(result, {});
});

// ── 2. Non-matching event types ignored ────────────────────────────────────

test('ignores events that are not extraction_plugin_completed', () => {
  const events = [
    makeEvent('source_fetch_started', { plugin: 'screenshot', url: 'https://a.com', worker_id: 'w1' }),
    makeEvent('extraction_plugin_failed', { plugin: 'screenshot', url: 'https://b.com', worker_id: 'w2' }),
  ];
  const result = buildExtractionPluginPhases(events);
  assert.deepStrictEqual(result, {});
});

// ── 3. Single plugin, single event ─────────────────────────────────────────

test('groups a single extraction_plugin_completed event', () => {
  const events = [makeExtractionEvent('screenshot', 'https://a.com', 'fetch-1')];
  const result = buildExtractionPluginPhases(events);

  assert.deepStrictEqual(result, {
    screenshot: {
      entries: [{ url: 'https://a.com', worker_id: 'fetch-1' }],
      total: 1,
    },
  });
});

// ── 4. Single plugin, multiple events ──────────────────────────────────────

test('accumulates multiple events for the same plugin', () => {
  const events = [
    makeExtractionEvent('screenshot', 'https://a.com', 'fetch-1'),
    makeExtractionEvent('screenshot', 'https://b.com', 'fetch-2'),
  ];
  const result = buildExtractionPluginPhases(events);

  assert.equal(result.screenshot.entries.length, 2);
  assert.equal(result.screenshot.total, 2);
  assert.equal(result.screenshot.entries[0].url, 'https://a.com');
  assert.equal(result.screenshot.entries[1].url, 'https://b.com');
});

// ── 5. Multiple distinct plugins auto-grouped ──────────────────────────────

test('groups events by plugin name into separate keys', () => {
  const events = [
    makeExtractionEvent('screenshot', 'https://a.com', 'fetch-1'),
    makeExtractionEvent('metadata', 'https://a.com', 'fetch-1'),
    makeExtractionEvent('screenshot', 'https://b.com', 'fetch-2'),
  ];
  const result = buildExtractionPluginPhases(events);

  assert.equal(Object.keys(result).length, 2);
  assert.equal(result.screenshot.total, 2);
  assert.equal(result.metadata.total, 1);
  assert.equal(result.metadata.entries[0].url, 'https://a.com');
});

// ── 6. Unknown future plugin auto-grouped (no code change) ─────────────────

test('auto-groups an unknown plugin name without requiring code changes', () => {
  const events = [makeExtractionEvent('reddit_capture', 'https://reddit.com/r/mice', 'fetch-3')];
  const result = buildExtractionPluginPhases(events);

  assert.ok(result.reddit_capture);
  assert.equal(result.reddit_capture.total, 1);
  assert.equal(result.reddit_capture.entries[0].url, 'https://reddit.com/r/mice');
});

// ── 7. Empty plugin name skipped ───────────────────────────────────────────

test('skips events with empty or missing plugin name', () => {
  const events = [
    makeExtractionEvent('', 'https://a.com', 'fetch-1'),
    makeExtractionEvent(undefined, 'https://b.com', 'fetch-2'),
  ];
  const result = buildExtractionPluginPhases(events);
  assert.deepStrictEqual(result, {});
});
