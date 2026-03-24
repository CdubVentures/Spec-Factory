import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  makeBridge,
  baseRow,
  startRun,
} from './helpers/runtimeBridgeEventAuditHarness.js';

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
