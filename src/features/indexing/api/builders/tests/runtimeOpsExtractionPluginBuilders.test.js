import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExtractionPluginPhases } from '../runtimeOpsExtractionPluginBuilders.js';

function makeEvent(event, payload = {}) {
  return { event, ts: '2026-03-25T12:00:00.000Z', payload };
}

function makeExtractionEvent(plugin, url, workerId, result = undefined, ts = undefined) {
  const payload = { plugin, url, worker_id: workerId };
  if (result !== undefined) payload.result = result;
  const evt = makeEvent('extraction_plugin_completed', payload);
  if (ts) evt.ts = ts;
  return evt;
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

test('groups a single extraction_plugin_completed event with host and ts', () => {
  const events = [makeExtractionEvent('screenshot', 'https://a.com', 'fetch-1')];
  const result = buildExtractionPluginPhases(events);

  assert.equal(result.screenshot.total, 1);
  const entry = result.screenshot.entries[0];
  assert.equal(entry.url, 'https://a.com');
  assert.equal(entry.worker_id, 'fetch-1');
  assert.equal(entry.host, 'a.com');
  assert.equal(typeof entry.ts, 'string');
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

// ── 8. Result spread (mirrors fetch builder pattern) ─────────────────────

test('spreads result fields into each entry', () => {
  const events = [
    makeExtractionEvent('screenshot', 'https://rtings.com', 'fetch-1', {
      screenshot_count: 2,
      total_bytes: 150000,
      formats: ['jpeg'],
      has_stitched: false,
    }),
  ];

  const result = buildExtractionPluginPhases(events);
  const entry = result.screenshot.entries[0];

  assert.equal(entry.screenshot_count, 2);
  assert.equal(entry.total_bytes, 150000);
  assert.deepStrictEqual(entry.formats, ['jpeg']);
  assert.equal(entry.has_stitched, false);
});

// ── 9. Host derivation ───────────────────────────────────────────────────

test('derives host from url', () => {
  const events = [
    makeExtractionEvent('screenshot', 'https://www.rtings.com/mouse/reviews', 'fetch-1'),
  ];

  const result = buildExtractionPluginPhases(events);
  assert.equal(result.screenshot.entries[0].host, 'www.rtings.com');
});

test('host is empty string for invalid url', () => {
  const events = [
    makeExtractionEvent('screenshot', 'not-a-url', 'fetch-1'),
  ];

  const result = buildExtractionPluginPhases(events);
  assert.equal(result.screenshot.entries[0].host, '');
});

// ── 10. Timestamp forwarded ──────────────────────────────────────────────

test('includes ts from event', () => {
  const events = [
    makeExtractionEvent('screenshot', 'https://a.com', 'fetch-1', {}, '2026-03-27T12:34:56Z'),
  ];

  const result = buildExtractionPluginPhases(events);
  assert.equal(result.screenshot.entries[0].ts, '2026-03-27T12:34:56Z');
});

// ── 11. Unknown plugin with custom result fields auto-grouped ────────────

test('unknown plugin spreads its result without code changes (O(1))', () => {
  const events = [
    makeExtractionEvent('pdf_extract', 'https://b.com', 'fetch-2', { pages: 5, tables: 3 }),
  ];

  const result = buildExtractionPluginPhases(events);
  assert.equal(result.pdf_extract.entries[0].pages, 5);
  assert.equal(result.pdf_extract.entries[0].tables, 3);
});

// ── 12. Regression: artifacts_persisted emitted BEFORE plugin_completed ────
// Transform-phase plugins (crawl4ai) persist inside onExtract and emit the
// persisted event before the runner emits completed. The builder must still
// join filenames onto the matching entry regardless of event order.

test('attaches filenames when artifacts_persisted fires BEFORE plugin_completed', () => {
  const events = [
    makeEvent('extraction_artifacts_persisted', {
      plugin: 'crawl4ai', url: 'https://x.com/p', worker_id: 'fetch-1',
      filenames: ['abc123.json'], file_sizes: [4096],
    }),
    makeExtractionEvent('crawl4ai', 'https://x.com/p', 'fetch-1', { status: 'ok' }),
  ];
  const result = buildExtractionPluginPhases(events);
  const entry = result.crawl4ai.entries[0];
  assert.deepStrictEqual(entry.filenames, ['abc123.json']);
  assert.deepStrictEqual(entry.file_sizes, [4096]);
});

test('attaches filenames when artifacts_persisted fires AFTER plugin_completed (screenshot path)', () => {
  const events = [
    makeExtractionEvent('screenshot', 'https://x.com/p', 'fetch-1', { screenshot_count: 2 }),
    makeEvent('extraction_artifacts_persisted', {
      plugin: 'screenshot', url: 'https://x.com/p', worker_id: 'fetch-1',
      filenames: ['s1.jpg', 's2.jpg'], file_sizes: [1000, 2000],
    }),
  ];
  const result = buildExtractionPluginPhases(events);
  const entry = result.screenshot.entries[0];
  assert.deepStrictEqual(entry.filenames, ['s1.jpg', 's2.jpg']);
  assert.deepStrictEqual(entry.file_sizes, [1000, 2000]);
});
