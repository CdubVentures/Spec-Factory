import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { IndexLabRuntimeBridge } from '../runtimeBridge.js';

async function makeBridge(overrides = {}) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-audit-'));
  const events = [];
  const bridge = new IndexLabRuntimeBridge({
    outRoot: tmpDir,
    onEvent: (ev) => events.push(ev),
    ...overrides
  });
  return { bridge, events, tmpDir };
}

function baseRow(overrides = {}) {
  return {
    runId: 'run-audit-001',
    event: 'run_started',
    ts: '2025-01-01T00:00:00Z',
    category: 'mouse',
    productId: 'mouse-test-01',
    ...overrides
  };
}

async function startRun(bridge) {
  bridge.onRuntimeEvent(baseRow());
  await bridge.queue;
}

test('visual_asset_captured event is emitted by bridge', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'visual_asset_captured',
    ts: '2025-01-01T00:01:00Z',
    url: 'https://razer.com/viper',
    screenshot_uri: 'screenshots/viper-001.webp',
    quality_score: 0.85,
    width: 1920,
    height: 1080,
    format: 'webp',
    bytes: 45000,
    capture_ms: 320
  }));
  await bridge.queue;

  const captured = events.filter((e) => e.event === 'visual_asset_captured');
  assert.equal(captured.length, 1, 'should emit visual_asset_captured');
  assert.equal(captured[0].payload.url, 'https://razer.com/viper');
  assert.equal(captured[0].payload.screenshot_uri, 'screenshots/viper-001.webp');
  assert.equal(captured[0].stage, 'fetch');
});

test('bridge persists last screencast frame for a fetch worker when the fetch closes', async () => {
  const { bridge, tmpDir } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
    host: 'razer.com',
    tier: 1,
    fetcher_kind: 'crawlee',
  }));
  await bridge.queue;

  bridge.broadcastScreencastFrame({
    worker_id: 'fetch-1',
    data: 'abc123',
    width: 1280,
    height: 720,
    ts: '2025-01-01T00:00:31Z',
  });
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_failed',
    ts: '2025-01-01T00:00:32Z',
    url: 'https://razer.com/viper',
    host: 'razer.com',
    fetcher_kind: 'crawlee',
    fetch_ms: 1000,
    status: 451,
    message: 'HTTP 451',
  }));
  await bridge.queue;

  const persistedPath = path.join(tmpDir, 'run-audit-001', 'runtime_screencast', 'fetch-1.json');
  const persisted = JSON.parse(await fs.readFile(persistedPath, 'utf8'));
  assert.equal(persisted.worker_id, 'fetch-1');
  assert.equal(persisted.data, 'abc123');
  assert.equal(persisted.width, 1280);
  assert.equal(persisted.height, 720);
});

test('bridge finalize persists last screencast frame for active fetch workers', async () => {
  const { bridge, tmpDir } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
    host: 'razer.com',
    tier: 1,
    fetcher_kind: 'playwright',
  }));
  await bridge.queue;

  bridge.broadcastScreencastFrame({
    worker_id: 'fetch-1',
    data: 'finalframe',
    width: 1024,
    height: 768,
    ts: '2025-01-01T00:00:31Z',
  });
  await bridge.queue;

  await bridge.finalize({
    ended_at: '2025-01-01T00:01:00Z',
    status: 'completed',
  });

  const persistedPath = path.join(tmpDir, 'run-audit-001', 'runtime_screencast', 'fetch-1.json');
  const persisted = JSON.parse(await fs.readFile(persistedPath, 'utf8'));
  assert.equal(persisted.worker_id, 'fetch-1');
  assert.equal(persisted.data, 'finalframe');
  assert.equal(persisted.width, 1024);
  assert.equal(persisted.height, 768);
});

test('run_completed event is emitted by bridge', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'run_completed',
    ts: '2025-01-01T00:10:00Z',
    identity_fingerprint: 'fp-abc',
    identity_lock_status: 'locked',
    dedupe_mode: 'content_hash',
    phase_cursor: 'completed'
  }));
  await bridge.queue;

  const completed = events.filter((e) => e.event === 'run_completed');
  assert.equal(completed.length, 1, 'should emit run_completed');
  assert.equal(completed[0].payload.identity_fingerprint, 'fp-abc');
  assert.equal(completed[0].stage, 'runtime');
});

test('source_processed triggers parse_finished and fetch_finished', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
    host: 'razer.com',
    tier: 1
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'source_processed',
    ts: '2025-01-01T00:01:00Z',
    url: 'https://razer.com/viper',
    status: 200,
    candidate_count: 5,
    fetch_ms: 300,
    parse_ms: 50,
    host: 'razer.com'
  }));
  await bridge.queue;

  const fetchFinished = events.filter((e) => e.event === 'fetch_finished');
  assert.ok(fetchFinished.length >= 1, 'source_processed should trigger fetch_finished');

  const sourceProcessed = events.filter((e) => e.event === 'source_processed');
  assert.equal(sourceProcessed.length, 1, 'source_processed should be emitted into normalized run events');
  assert.equal(sourceProcessed[0].payload.url, 'https://razer.com/viper');

  const parseFinished = events.filter((e) => e.event === 'parse_finished');
  assert.equal(parseFinished.length, 1, 'source_processed should trigger parse_finished');
  assert.equal(parseFinished[0].payload.url, 'https://razer.com/viper');
  assert.equal(parseFinished[0].payload.candidate_count, 5);
});

test('source_processed normalized event preserves bytes, content hash, and extraction method for downstream GUI routes', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
    host: 'www.rtings.com',
    tier: 1,
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'source_processed',
    ts: '2025-01-01T00:01:00Z',
    url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
    final_url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
    host: 'www.rtings.com',
    status: 200,
    fetch_ms: 30702,
    parse_ms: 12348,
    candidate_count: 1644,
    content_type: 'text/html',
    content_hash: 'd0d8a9d07ae54ee7db145521bf7b73583e224bed8047c337e9a0ee98d1586bbe',
    bytes: 436975,
    article_extraction_method: 'readability',
    static_dom_mode: 'cheerio',
  }));
  await bridge.queue;

  const sourceProcessed = events.find((e) => e.event === 'source_processed');
  assert.ok(sourceProcessed);
  assert.equal(sourceProcessed.payload.status, 200);
  assert.equal(sourceProcessed.payload.bytes, 436975);
  assert.equal(
    sourceProcessed.payload.content_hash,
    'd0d8a9d07ae54ee7db145521bf7b73583e224bed8047c337e9a0ee98d1586bbe'
  );
  assert.equal(sourceProcessed.payload.article_extraction_method, 'readability');
  assert.equal(sourceProcessed.payload.static_dom_mode, 'cheerio');
});

test('fetch_trace_written closes an active fetch when downstream source_processed telemetry never arrives', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
    host: 'www.rtings.com',
    tier: 1,
    fetcher_kind: 'playwright',
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'fetch_trace_written',
    ts: '2025-01-01T00:00:47Z',
    url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
    status: 200,
    fetch_ms: 17000,
    content_type: 'text/html',
  }));
  await bridge.queue;

  const fetchStarted = events.filter((e) => e.event === 'fetch_started' && e.payload.scope === 'url');
  const fetchFinished = events.filter((e) => e.event === 'fetch_finished' && e.payload.scope === 'url');

  assert.equal(fetchStarted.length, 1);
  assert.equal(fetchFinished.length, 1, 'fetch_trace_written should close the active fetch');
  assert.equal(fetchFinished[0].payload.url, 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro');
  assert.equal(fetchFinished[0].payload.status, 200);
  assert.equal(fetchFinished[0].payload.content_type, 'text/html');
  assert.equal(fetchFinished[0].payload.worker_id, fetchStarted[0].payload.worker_id);
});

test('fetch_trace_written does not duplicate fetch_finished after source_fetch_failed already closed the worker', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://blocked.example/spec',
    host: 'blocked.example',
    tier: 1,
    fetcher_kind: 'crawlee',
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_failed',
    ts: '2025-01-01T00:00:31Z',
    url: 'https://blocked.example/spec',
    host: 'blocked.example',
    fetcher_kind: 'crawlee',
    fetch_ms: 1000,
    status: 0,
    message: 'Crawlee fetch failed: no_result',
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'fetch_trace_written',
    ts: '2025-01-01T00:00:31.100Z',
    url: 'https://blocked.example/spec',
    status: 0,
    fetch_ms: 1000,
    content_type: '',
  }));
  await bridge.queue;

  const fetchFinished = events.filter((e) => e.event === 'fetch_finished' && e.payload.scope === 'url');
  assert.equal(fetchFinished.length, 1, 'fetch_trace_written should ignore already-closed fetches');
});

test('source_fetch_failed preserves blocked HTTP status in normalized fetch_finished event', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://blocked.example/spec',
    host: 'blocked.example',
    tier: 1,
    fetcher_kind: 'playwright',
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_failed',
    ts: '2025-01-01T00:00:31Z',
    url: 'https://blocked.example/spec',
    host: 'blocked.example',
    fetcher_kind: 'playwright',
    fetch_ms: 1000,
    status: 403,
    message: 'HTTP 403',
  }));
  await bridge.queue;

  const fetchFinished = events.filter((e) => e.event === 'fetch_finished' && e.payload.scope === 'url');
  assert.equal(fetchFinished.length, 1);
  assert.equal(fetchFinished[0].payload.status, 403);
  assert.equal(fetchFinished[0].payload.error, 'HTTP 403');
});

test('all spec events have handlers: search, fetch, parse, index, llm, needset', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'razer viper specs',
    provider: 'google'
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:15Z',
    query: 'razer viper specs',
    provider: 'google',
    result_count: 10
  }));
  await bridge.queue;

  const searchStarted = events.filter((e) => e.event === 'search_started' && e.payload.scope === 'query');
  assert.equal(searchStarted.length, 1, 'discovery_query_started → search_started');

  const searchFinished = events.filter((e) => e.event === 'search_finished' && e.payload.scope === 'query');
  assert.equal(searchFinished.length, 1, 'discovery_query_completed → search_finished');

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:20Z',
    url: 'https://razer.com',
    host: 'razer.com',
    tier: 1
  }));
  await bridge.queue;

  const fetchStartedUrl = events.filter((e) => e.event === 'fetch_started' && e.payload.scope === 'url');
  assert.equal(fetchStartedUrl.length, 1, 'source_fetch_started → fetch_started (url scope)');

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:30Z',
    reason: 'extract_candidates',
    model: 'gpt-4o',
    route_role: 'extract'
  }));
  await bridge.queue;

  const llmStarted = events.filter((e) => e.event === 'llm_started');
  assert.equal(llmStarted.length, 1, 'llm_call_started → llm_started');

  bridge.onRuntimeEvent(baseRow({
    event: 'needset_computed',
    ts: '2025-01-01T00:01:00Z',
    total_fields: 30,
    needset_size: 12,
    needs: []
  }));
  await bridge.queue;

  const needset = events.filter((e) => e.event === 'needset_computed');
  assert.equal(needset.length, 1, 'needset_computed emitted');
});

test('finalize clears fetchByUrl map to prevent memory leak', async () => {
  const { bridge } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
    host: 'razer.com',
    tier: 1
  }));
  await bridge.queue;

  assert.equal(bridge.fetchByUrl.size, 1, 'fetchByUrl should track in-flight fetch');

  await bridge.finalize({ status: 'completed' });

  assert.equal(bridge.fetchByUrl.size, 0, 'fetchByUrl should be cleared after finalize');
});

test('scheduler_fallback_started is emitted under fetch stage', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'scheduler_fallback_started',
    ts: '2025-01-01T00:02:00Z',
    url: 'https://blocked.com/page',
    from_mode: 'crawlee',
    to_mode: 'playwright',
    outcome: 'blocked',
    attempt: 1
  }));
  await bridge.queue;

  const started = events.filter((e) => e.event === 'scheduler_fallback_started');
  assert.equal(started.length, 1);
  assert.equal(started[0].stage, 'fetch');
  assert.equal(started[0].payload.url, 'https://blocked.com/page');
  assert.equal(started[0].payload.from_mode, 'crawlee');
  assert.equal(started[0].payload.to_mode, 'playwright');
  assert.equal(started[0].payload.outcome, 'blocked');
  assert.equal(started[0].payload.attempt, 1);
});

test('scheduler_fallback_succeeded is emitted under fetch stage', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'scheduler_fallback_succeeded',
    ts: '2025-01-01T00:02:30Z',
    url: 'https://blocked.com/page',
    mode: 'playwright',
    attempt: 1,
    from_mode: 'crawlee'
  }));
  await bridge.queue;

  const succeeded = events.filter((e) => e.event === 'scheduler_fallback_succeeded');
  assert.equal(succeeded.length, 1);
  assert.equal(succeeded[0].stage, 'fetch');
  assert.equal(succeeded[0].payload.url, 'https://blocked.com/page');
  assert.equal(succeeded[0].payload.mode, 'playwright');
  assert.equal(succeeded[0].payload.from_mode, 'crawlee');
});

test('scheduler_fallback_exhausted is emitted under fetch stage', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'scheduler_fallback_exhausted',
    ts: '2025-01-01T00:03:00Z',
    url: 'https://blocked.com/page',
    modes_tried: ['crawlee', 'playwright', 'http'],
    final_outcome: 'blocked'
  }));
  await bridge.queue;

  const exhausted = events.filter((e) => e.event === 'scheduler_fallback_exhausted');
  assert.equal(exhausted.length, 1);
  assert.equal(exhausted[0].stage, 'fetch');
  assert.equal(exhausted[0].payload.url, 'https://blocked.com/page');
  assert.deepEqual(exhausted[0].payload.modes_tried, ['crawlee', 'playwright', 'http']);
  assert.equal(exhausted[0].payload.final_outcome, 'blocked');
});

test('run_started writes baseline needset and search profile artifacts', async () => {
  const { bridge, tmpDir } = await makeBridge();
  await startRun(bridge);

  const runDir = path.join(tmpDir, 'run-audit-001');
  const needset = JSON.parse(await fs.readFile(path.join(runDir, 'needset.json'), 'utf8'));
  const searchProfile = JSON.parse(await fs.readFile(path.join(runDir, 'search_profile.json'), 'utf8'));
  const runMeta = JSON.parse(await fs.readFile(path.join(runDir, 'run.json'), 'utf8'));

  assert.equal(Number(needset.needset_size || 0), 0);
  assert.equal(Number(needset.total_fields || 0), 0);
  assert.ok(Array.isArray(needset.needs));

  assert.equal(String(searchProfile.status || ''), 'pending');
  assert.ok(Array.isArray(searchProfile.query_rows));
  assert.equal(searchProfile.query_rows.length, 0);
  assert.ok(Array.isArray(searchProfile.queries));

  assert.equal(Boolean(runMeta?.artifacts?.has_needset), true);
  assert.equal(Boolean(runMeta?.artifacts?.has_search_profile), true);
});

test('fetch_started event includes non-empty worker_id', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
    host: 'razer.com',
    tier: 1
  }));
  await bridge.queue;

  const fetchStarted = events.filter((e) => e.event === 'fetch_started' && e.payload.scope === 'url');
  assert.equal(fetchStarted.length, 1);
  assert.ok(fetchStarted[0].payload.worker_id, 'fetch_started must include worker_id');
  assert.ok(typeof fetchStarted[0].payload.worker_id === 'string');
  assert.ok(fetchStarted[0].payload.worker_id.startsWith('fetch-'));
});

test('fetch_finished event includes worker_id matching fetch_started for same URL', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
    host: 'razer.com',
    tier: 1
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'source_processed',
    ts: '2025-01-01T00:01:00Z',
    url: 'https://razer.com/viper',
    status: 200,
    candidate_count: 5,
    fetch_ms: 300,
    host: 'razer.com'
  }));
  await bridge.queue;

  const fetchStarted = events.filter((e) => e.event === 'fetch_started' && e.payload.scope === 'url');
  const fetchFinished = events.filter((e) => e.event === 'fetch_finished' && e.payload.scope === 'url');

  assert.equal(fetchStarted.length, 1);
  assert.ok(fetchFinished.length >= 1);
  assert.equal(
    fetchFinished[0].payload.worker_id,
    fetchStarted[0].payload.worker_id,
    'fetch_finished worker_id must match fetch_started for same URL'
  );
});

test('parse_finished event includes worker_id matching the fetch for same URL', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
    host: 'razer.com',
    tier: 1
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'source_processed',
    ts: '2025-01-01T00:01:00Z',
    url: 'https://razer.com/viper',
    status: 200,
    candidate_count: 5,
    fetch_ms: 300,
    host: 'razer.com'
  }));
  await bridge.queue;

  const fetchStarted = events.filter((e) => e.event === 'fetch_started' && e.payload.scope === 'url');
  const parseFinished = events.filter((e) => e.event === 'parse_finished' && e.payload.scope === 'url');

  assert.equal(fetchStarted.length, 1);
  assert.equal(parseFinished.length, 1);
  assert.equal(
    parseFinished[0].payload.worker_id,
    fetchStarted[0].payload.worker_id,
    'parse_finished worker_id must match fetch for same URL'
  );
});

test('index_finished event includes worker_id inherited from fetch', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
    host: 'razer.com',
    tier: 1
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'fields_filled_from_source',
    ts: '2025-01-01T00:01:30Z',
    url: 'https://razer.com/viper',
    count: 3,
    filled_fields: ['weight', 'sensor', 'dpi']
  }));
  await bridge.queue;

  const fetchStarted = events.filter((e) => e.event === 'fetch_started' && e.payload.scope === 'url');
  const indexFinished = events.filter((e) => e.event === 'index_finished' && e.payload.scope === 'url');

  assert.equal(fetchStarted.length, 1);
  assert.equal(indexFinished.length, 1);
  assert.equal(
    indexFinished[0].payload.worker_id,
    fetchStarted[0].payload.worker_id,
    'index_finished worker_id must match fetch for same URL'
  );
});

test('search_started event includes worker_id with search- prefix', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'razer viper specs',
    provider: 'google'
  }));
  await bridge.queue;

  const searchStarted = events.filter((e) => e.event === 'search_started' && e.payload.scope === 'query');
  assert.equal(searchStarted.length, 1);
  assert.ok(searchStarted[0].payload.worker_id, 'search_started must include worker_id');
  assert.ok(searchStarted[0].payload.worker_id.startsWith('search-'));
});

test('search_finished event includes worker_id with search- prefix', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:15Z',
    query: 'razer viper specs',
    provider: 'google',
    result_count: 10
  }));
  await bridge.queue;

  const searchFinished = events.filter((e) => e.event === 'search_finished');
  assert.equal(searchFinished.length, 1);
  assert.ok(searchFinished[0].payload.worker_id, 'search_finished must include worker_id');
  assert.ok(searchFinished[0].payload.worker_id.startsWith('search-'));
});

test('search_request_throttled event is emitted by bridge with throttle payload', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'search_request_throttled',
    ts: '2025-01-01T00:00:12Z',
    query: 'razer viper v3 pro specs',
    provider: 'google',
    key: 'www.google.com',
    wait_ms: 375
  }));
  await bridge.queue;

  const throttled = events.filter((e) => e.event === 'search_request_throttled');
  assert.equal(throttled.length, 1, 'search_request_throttled should be emitted');
  assert.equal(throttled[0].stage, 'search');
  assert.equal(throttled[0].payload.scope, 'query');
  assert.equal(throttled[0].payload.query, 'razer viper v3 pro specs');
  assert.equal(throttled[0].payload.provider, 'google');
  assert.equal(throttled[0].payload.key, 'www.google.com');
  assert.equal(throttled[0].payload.wait_ms, 375);
  assert.ok(throttled[0].payload.worker_id, 'search_request_throttled must include worker_id');
  assert.ok(throttled[0].payload.worker_id.startsWith('search-'));
});

test('llm_started event includes worker_id with llm- prefix', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:30Z',
    reason: 'extract_candidates',
    model: 'gpt-4o',
    route_role: 'extract',
    batch_id: 'batch-42'
  }));
  await bridge.queue;

  const llmStarted = events.filter((e) => e.event === 'llm_started');
  assert.equal(llmStarted.length, 1);
  assert.ok(llmStarted[0].payload.worker_id, 'llm_started must include worker_id');
  assert.equal(llmStarted[0].payload.worker_id, 'llm-batch-42');
});

test('multiple fetches produce unique worker_ids', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
    host: 'razer.com',
    tier: 1
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_started',
    ts: '2025-01-01T00:00:31Z',
    url: 'https://logitech.com/gpx',
    host: 'logitech.com',
    tier: 1
  }));
  await bridge.queue;

  const fetchStarted = events.filter((e) => e.event === 'fetch_started' && e.payload.scope === 'url');
  assert.equal(fetchStarted.length, 2);
  assert.notEqual(
    fetchStarted[0].payload.worker_id,
    fetchStarted[1].payload.worker_id,
    'different fetches must have different worker_ids'
  );
});

test('search query events update search_profile artifact in run directory', async () => {
  const { bridge, tmpDir } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'razer viper v3 pro specs',
    provider: 'searxng'
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:12Z',
    query: 'razer viper v3 pro specs',
    provider: 'searxng',
    result_count: 11
  }));
  await bridge.queue;

  const runDir = path.join(tmpDir, 'run-audit-001');
  const searchProfile = JSON.parse(await fs.readFile(path.join(runDir, 'search_profile.json'), 'utf8'));
  const row = (searchProfile.query_rows || []).find((item) => item.query === 'razer viper v3 pro specs');

  assert.ok(row);
  assert.ok(Number(row.attempts || 0) >= 1);
  assert.equal(Number(row.result_count || 0), 11);
  assert.equal(String(searchProfile.status || ''), 'executed');
});
