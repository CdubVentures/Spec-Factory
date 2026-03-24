import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEffectiveSettingsSnapshot,
  REQUIRED_SETTINGS_KEYS,
  buildFetchDecisionEntry,
  FETCH_STRATEGIES,
  buildScreenshotManifestEntry,
  SCREENSHOT_MANIFEST_KEYS,
  buildScreenshotManifestFromEvents,
  buildRuntimeVsFinalDiff
} from '../src/features/indexing/validation/live-crawl/artifactBuilders.js';

// ── Effective Settings Snapshot ──────────────────────────────

test('buildEffectiveSettingsSnapshot captures required keys', () => {
  const config = {
    searchEngines: 'bing,brave,duckduckgo',
    discoveryEnabled: true,
    preferHttpFetcher: true,
    dynamicCrawleeEnabled: true,
    perHostMinDelayMs: 2000,
    pageGotoTimeoutMs: 30000,
    postLoadWaitMs: 1500,
    capturePageScreenshotEnabled: true,
    runProfile: 'default',
    maxUrlsPerProduct: 40,
    maxRunSeconds: 600
  };
  const snap = buildEffectiveSettingsSnapshot(config);
  assert.ok(snap.ts);
  assert.equal(snap.searchEngines, 'bing,brave,duckduckgo');
  assert.equal(snap.maxRunSeconds, 600);
  // All required keys present
  for (const key of REQUIRED_SETTINGS_KEYS) {
    assert.ok(key in snap, `missing required key: ${key}`);
  }
});

test('buildEffectiveSettingsSnapshot defaults missing keys to null', () => {
  const snap = buildEffectiveSettingsSnapshot({});
  for (const key of REQUIRED_SETTINGS_KEYS) {
    assert.ok(key in snap, `missing key: ${key}`);
  }
  assert.equal(snap.searchEngines, null);
});

// ── Fetch Decision Ledger ───────────────────────────────────

test('buildFetchDecisionEntry returns valid entry', () => {
  const entry = buildFetchDecisionEntry({
    url: 'https://example.com/specs',
    host: 'example.com',
    selected_strategy: 'http_static',
    reason: 'static_preferred',
    js_signal_detected: false,
    attempt_count: 1,
    final_status: 'ok',
    content_type: 'text/html',
    bytes: 45000,
    parse_methods_emitted: ['html_text', 'json_ld'],
    screenshots_captured: 0
  });
  assert.equal(entry.url, 'https://example.com/specs');
  assert.equal(entry.selected_strategy, 'http_static');
  assert.ok(entry.ts);
  assert.deepEqual(entry.parse_methods_emitted, ['html_text', 'json_ld']);
});

test('buildFetchDecisionEntry validates strategy enum', () => {
  for (const strategy of FETCH_STRATEGIES) {
    const entry = buildFetchDecisionEntry({ selected_strategy: strategy });
    assert.equal(entry.selected_strategy, strategy);
  }
});

test('buildFetchDecisionEntry defaults missing fields', () => {
  const entry = buildFetchDecisionEntry({});
  assert.equal(entry.url, null);
  assert.equal(entry.selected_strategy, 'unknown');
  assert.equal(entry.attempt_count, 0);
  assert.deepEqual(entry.parse_methods_emitted, []);
});

test('FETCH_STRATEGIES has expected values', () => {
  assert.deepEqual(FETCH_STRATEGIES, [
    'http_static', 'crawlee_dynamic', 'retry_dynamic', 'pdf_direct', 'abandoned', 'unknown'
  ]);
});

// ── Screenshot Manifest ─────────────────────────────────────

test('buildScreenshotManifestEntry returns valid entry', () => {
  const entry = buildScreenshotManifestEntry({
    frame_id: 'f-001',
    run_id: 'run-abc',
    worker_id: 'w-1',
    url: 'https://example.com',
    captured_at: '2026-03-09T12:00:00.000Z',
    width: 1920,
    height: 1080,
    mode: 'screencast',
    retained: true,
    asset_path: '/screenshots/f-001.jpg',
    content_hash: 'sha256:abc123'
  });
  assert.equal(entry.frame_id, 'f-001');
  assert.equal(entry.run_id, 'run-abc');
  assert.equal(entry.width, 1920);
  assert.equal(entry.retained, true);
});

test('buildScreenshotManifestEntry defaults missing fields', () => {
  const entry = buildScreenshotManifestEntry({});
  assert.equal(entry.frame_id, null);
  assert.equal(entry.width, 0);
  assert.equal(entry.retained, false);
});

test('buildScreenshotManifestFromEvents extracts manifest from parse_finished events', () => {
  const events = [
    { event: 'fetch_started', payload: { worker_id: 'fetch-1', url: 'https://example.com' } },
    {
      event: 'parse_finished',
      payload: {
        worker_id: 'fetch-1',
        url: 'https://example.com',
        screenshot_uri: 'screenshots/example.com__0000/screenshot.jpg',
      },
    },
    {
      event: 'parse_finished',
      payload: {
        worker_id: 'fetch-2',
        url: 'https://other.com/specs',
        screenshot_uri: 'screenshots/other.com__0001/screenshot.jpg',
      },
    },
    { event: 'parse_finished', payload: { worker_id: 'fetch-3', url: 'https://no-ss.com' } },
  ];
  const manifest = buildScreenshotManifestFromEvents(events, 'run-123');
  assert.equal(manifest.length, 2);
  assert.equal(manifest[0].worker_id, 'fetch-1');
  assert.equal(manifest[0].url, 'https://example.com');
  assert.equal(manifest[0].run_id, 'run-123');
  assert.equal(manifest[0].asset_path, 'screenshots/example.com__0000/screenshot.jpg');
  assert.equal(manifest[1].worker_id, 'fetch-2');
  for (const entry of manifest) {
    for (const key of SCREENSHOT_MANIFEST_KEYS) {
      assert.ok(key in entry, `missing key: ${key}`);
    }
  }
});

test('buildScreenshotManifestFromEvents returns empty for no screenshot events', () => {
  const events = [
    { event: 'fetch_started', payload: { worker_id: 'fetch-1' } },
    { event: 'parse_finished', payload: { worker_id: 'fetch-1', url: 'https://x.com' } },
  ];
  const manifest = buildScreenshotManifestFromEvents(events, 'run-456');
  assert.equal(manifest.length, 0);
});

test('buildScreenshotManifestFromEvents deduplicates by screenshot_uri', () => {
  const events = [
    {
      event: 'parse_finished',
      payload: {
        worker_id: 'fetch-1',
        url: 'https://example.com',
        screenshot_uri: 'screenshots/example.com__0000/screenshot.jpg',
      },
    },
    {
      event: 'parse_finished',
      payload: {
        worker_id: 'fetch-1',
        url: 'https://example.com/alt',
        screenshot_uri: 'screenshots/example.com__0000/screenshot.jpg',
      },
    },
  ];
  const manifest = buildScreenshotManifestFromEvents(events, 'run-789');
  assert.equal(manifest.length, 1);
});

// ── Runtime vs Final Diff ───────────────────────────────────

test('buildRuntimeVsFinalDiff computes correct diff', () => {
  const runtimeFields = {
    weight: { value: '85g', confidence: 0.95 },
    sensor: { value: 'PAW3950', confidence: 0.9 },
    dpi: { value: '30000', confidence: 0.85 },
    shape: { value: 'unk', confidence: null }
  };
  const finalSpec = {
    weight: '85g',
    sensor: 'PAW3950'
    // dpi dropped, shape was unknown
  };
  const diff = buildRuntimeVsFinalDiff(runtimeFields, finalSpec);
  assert.ok(diff.ts);
  assert.equal(diff.runtime_filled_count, 3); // weight, sensor, dpi (not shape=unk)
  assert.equal(diff.final_filled_count, 2);
  assert.equal(diff.dropped_count, 1); // dpi
  assert.ok(diff.dropped_fields.includes('dpi'));
  assert.equal(diff.added_count, 0);
  assert.ok(typeof diff.agreement_rate === 'number');
});

test('buildRuntimeVsFinalDiff handles empty inputs', () => {
  const diff = buildRuntimeVsFinalDiff({}, {});
  assert.equal(diff.runtime_filled_count, 0);
  assert.equal(diff.final_filled_count, 0);
  assert.equal(diff.dropped_count, 0);
  assert.equal(diff.agreement_rate, 1);
});

test('buildRuntimeVsFinalDiff detects value mismatches', () => {
  const runtimeFields = {
    weight: { value: '85g', confidence: 0.9 }
  };
  const finalSpec = { weight: '90g' };
  const diff = buildRuntimeVsFinalDiff(runtimeFields, finalSpec);
  assert.equal(diff.mismatch_count, 1);
  assert.ok(diff.mismatched_fields.some((f) => f.field === 'weight'));
});
