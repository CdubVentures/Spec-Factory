import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  makeBridge,
  baseRow,
  startRun,
} from './helpers/runtimeBridgeEventAuditHarness.js';

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
