import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDefaultsAligned,
  evaluateCrawlAlive,
  evaluateParserAlive,
  evaluateExtractionAlive,
  evaluatePublishableAlive,
  evaluateScreenshots,
  evaluateAllSections
} from '../src/features/indexing/validation/live-crawl/sectionEvaluators.js';

// ── Helper: minimal run data ────────────────────────────────

function makeRunData(overrides = {}) {
  return {
    settings_snapshot: {
      ts: '2026-03-09T12:00:00.000Z',
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
    },
    run_meta: {
      run_id: 'run-001',
      product_id: 'mouse-razer-viper',
      category: 'mouse',
      started_at: '2026-03-09T12:00:00.000Z',
      ended_at: '2026-03-09T12:05:30.000Z',
      status: 'completed',
      exit_code: 0
    },
    events: [
      { event: 'search_query', ts: '2026-03-09T12:00:05.000Z' },
      { event: 'fetch_start', ts: '2026-03-09T12:00:10.000Z' },
      { event: 'fetch_complete', ts: '2026-03-09T12:00:15.000Z', payload: { status: 'ok' } }
    ],
    fetch_ledger: [
      { url: 'https://razer.com/viper', host: 'razer.com', selected_strategy: 'http_static', final_status: 'ok', attempt_count: 1, content_type: 'text/html', bytes: 50000, parse_methods_emitted: ['html_text', 'json_ld'] }
    ],
    parser_traces: {
      methods_seen: ['html_text', 'json_ld', 'spec_table'],
      method_counts: { html_text: 3, json_ld: 2, spec_table: 1 }
    },
    extraction: {
      candidates: [
        { field: 'weight', value: '85g', confidence: 0.95, source_host: 'razer.com' },
        { field: 'sensor', value: 'PAW3950', confidence: 0.9, source_host: 'razer.com' }
      ]
    },
    artifacts: {
      spec_json: true,
      summary_json: true,
      provenance_json: true,
      evidence_pack: true,
      sources_jsonl: true
    },
    final_spec: {
      weight: '85g',
      sensor: 'PAW3950',
      publishable: true,
      identity_outcome: 'locked'
    },
    ...overrides
  };
}

// ── Section 1: Defaults Aligned ─────────────────────────────

test('evaluateDefaultsAligned returns GREEN with valid snapshot', () => {
  const runData = makeRunData();
  const results = evaluateDefaultsAligned(runData);
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  // DA-01: snapshot captured
  const da01 = results.find((r) => r.id === 'DA-01');
  assert.ok(da01);
  assert.equal(da01.status, 'pass');
});

test('evaluateDefaultsAligned returns fail without snapshot', () => {
  const runData = makeRunData({ settings_snapshot: null });
  const results = evaluateDefaultsAligned(runData);
  const da01 = results.find((r) => r.id === 'DA-01');
  assert.equal(da01.status, 'fail');
});

// ── Section 2: Crawl Alive ──────────────────────────────────

test('evaluateCrawlAlive returns pass for live run with events', () => {
  const runData = makeRunData();
  const results = evaluateCrawlAlive(runData);
  assert.ok(results.length > 0);
  const ca01 = results.find((r) => r.id === 'CA-01');
  assert.equal(ca01.status, 'pass');
});

test('evaluateCrawlAlive returns fail without run_meta', () => {
  const runData = makeRunData({ run_meta: null });
  const results = evaluateCrawlAlive(runData);
  const ca01 = results.find((r) => r.id === 'CA-01');
  assert.equal(ca01.status, 'fail');
});

// ── Section 5: Parser Alive ─────────────────────────────────

test('evaluateParserAlive passes with parser traces', () => {
  const runData = makeRunData();
  const results = evaluateParserAlive(runData);
  // PA-02: method counts non-zero
  const pa02 = results.find((r) => r.id === 'PA-02');
  assert.equal(pa02.status, 'pass');
});

test('evaluateParserAlive fails with empty parser traces', () => {
  const runData = makeRunData({ parser_traces: { methods_seen: [], method_counts: {} } });
  const results = evaluateParserAlive(runData);
  const pa02 = results.find((r) => r.id === 'PA-02');
  assert.equal(pa02.status, 'fail');
});

// ── Section 6: Extraction Alive ─────────────────────────────

test('evaluateExtractionAlive passes with extraction candidates', () => {
  const runData = makeRunData();
  const results = evaluateExtractionAlive(runData);
  const ea01 = results.find((r) => r.id === 'EA-01');
  assert.equal(ea01.status, 'pass');
});

test('evaluateExtractionAlive fails with no candidates', () => {
  const runData = makeRunData({ extraction: { candidates: [] } });
  const results = evaluateExtractionAlive(runData);
  const ea01 = results.find((r) => r.id === 'EA-01');
  assert.equal(ea01.status, 'fail');
});

// ── Section 7: Publishable Alive ────────────────────────────

test('evaluatePublishableAlive passes with all artifacts present', () => {
  const runData = makeRunData();
  const results = evaluatePublishableAlive(runData);
  const pb01 = results.find((r) => r.id === 'PB-01');
  assert.equal(pb01.status, 'pass');
});

test('evaluatePublishableAlive fails with missing spec.json', () => {
  const runData = makeRunData({ artifacts: { spec_json: false, summary_json: true, provenance_json: true, evidence_pack: true, sources_jsonl: true } });
  const results = evaluatePublishableAlive(runData);
  const pb01 = results.find((r) => r.id === 'PB-01');
  assert.equal(pb01.status, 'fail');
});

// ── Section 9: Screenshots ────────────────────────────────

test('evaluateScreenshots passes SS-04 and SS-10 when manifest has entries', () => {
  const runData = makeRunData({
    screenshot_manifest: [
      { frame_id: 'ss-0', run_id: 'run-001', worker_id: 'fetch-1', url: 'https://example.com', width: 1920, height: 1080, asset_path: 'screenshots/example.com/ss.jpg' },
      { frame_id: 'ss-1', run_id: 'run-001', worker_id: 'fetch-2', url: 'https://other.com', width: 1920, height: 1080, asset_path: 'screenshots/other.com/ss.jpg' },
    ],
    fetch_ledger: [
      { url: 'https://example.com', final_status: 'ok' },
      { url: 'https://other.com', final_status: 'ok' },
    ],
  });
  const results = evaluateScreenshots(runData);
  const ss04 = results.find((r) => r.id === 'SS-04');
  const ss05 = results.find((r) => r.id === 'SS-05');
  const ss10 = results.find((r) => r.id === 'SS-10');
  assert.equal(ss04.status, 'pass');
  assert.equal(ss05.status, 'pass');
  assert.equal(ss10.status, 'pass');
});

test('evaluateScreenshots fails SS-04 and SS-10 when manifest is empty', () => {
  const runData = makeRunData({
    screenshot_manifest: [],
    fetch_ledger: [{ url: 'https://example.com', final_status: 'ok' }],
  });
  const results = evaluateScreenshots(runData);
  const ss04 = results.find((r) => r.id === 'SS-04');
  const ss10 = results.find((r) => r.id === 'SS-10');
  assert.equal(ss04.status, 'fail');
  assert.equal(ss10.status, 'fail');
});

// ── evaluateAllSections ─────────────────────────────────────

test('evaluateAllSections returns results for all sections', () => {
  const runData = makeRunData();
  const allResults = evaluateAllSections(runData);
  assert.ok(allResults.section_results);
  assert.ok(allResults.verdicts);
  assert.equal(Object.keys(allResults.verdicts).length, 5);
  assert.ok(allResults.total_checks > 0);
  assert.ok(typeof allResults.pass_count === 'number');
  assert.ok(typeof allResults.fail_count === 'number');
  assert.ok(typeof allResults.skip_count === 'number');
});
