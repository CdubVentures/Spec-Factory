import test from 'node:test';
import assert from 'node:assert/strict';
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
