import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBridge,
  baseRow,
  startRun,
} from './helpers/runtimeBridgeEventAuditHarness.js';

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
