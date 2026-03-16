import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkerScreenshots } from '../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

function makeEvent(event, payload = {}, overrides = {}) {
  return {
    run_id: 'run-001',
    ts: '2026-02-20T00:01:00.000Z',
    event,
    payload,
    ...overrides,
  };
}

test('buildWorkerScreenshots: returns correct records from visual_asset_captured events', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://razer.com/viper', worker_id: 'fetch-1' }),
    makeEvent('visual_asset_captured', {
      url: 'https://razer.com/viper',
      worker_id: 'fetch-1',
      screenshot_uri: 'screenshots/viper.webp',
      width: 1920,
      height: 1080,
      bytes: 45000,
      quality_score: 0.85,
    }, { ts: '2026-02-20T00:02:00.000Z' }),
  ];
  const result = buildWorkerScreenshots(events, 'fetch-1');
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  assert.equal(result[0].filename, 'screenshots/viper.webp');
  assert.equal(result[0].url, 'https://razer.com/viper');
  assert.equal(result[0].width, 1920);
  assert.equal(result[0].height, 1080);
  assert.equal(result[0].bytes, 45000);
});

test('buildWorkerScreenshots: empty for workers with no screenshots', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://razer.com/viper', worker_id: 'fetch-1' }),
    makeEvent('fetch_finished', { url: 'https://razer.com/viper', worker_id: 'fetch-1', status_code: 200 }),
  ];
  const result = buildWorkerScreenshots(events, 'fetch-1');
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('buildWorkerScreenshots: only returns screenshots for specified worker', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://razer.com/viper', worker_id: 'fetch-1' }),
    makeEvent('visual_asset_captured', {
      url: 'https://razer.com/viper',
      worker_id: 'fetch-1',
      screenshot_uri: 'screenshots/viper.webp',
      width: 1920,
      height: 1080,
      bytes: 45000,
    }),
    makeEvent('fetch_started', { url: 'https://logitech.com/gpx', worker_id: 'fetch-2' }),
    makeEvent('visual_asset_captured', {
      url: 'https://logitech.com/gpx',
      worker_id: 'fetch-2',
      screenshot_uri: 'screenshots/gpx.webp',
      width: 1920,
      height: 1080,
      bytes: 30000,
    }),
  ];
  const result = buildWorkerScreenshots(events, 'fetch-1');
  assert.equal(result.length, 1);
  assert.equal(result[0].filename, 'screenshots/viper.webp');
});

test('buildWorkerScreenshots: deduplicates when both visual_asset_captured and parse_finished carry the same screenshot', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://razer.com/viper', worker_id: 'fetch-1' }),
    makeEvent('visual_asset_captured', {
      url: 'https://razer.com/viper',
      worker_id: 'fetch-1',
      screenshot_uri: 'screenshots/viper.webp',
      width: 1920,
      height: 1080,
      bytes: 45000,
    }, { ts: '2026-02-20T00:01:30.000Z' }),
    makeEvent('parse_finished', {
      url: 'https://razer.com/viper',
      worker_id: 'fetch-1',
      screenshot_uri: 'screenshots/viper.webp',
    }, { ts: '2026-02-20T00:02:00.000Z' }),
  ];
  const result = buildWorkerScreenshots(events, 'fetch-1');
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1, 'should deduplicate identical screenshot_uri');
  assert.equal(result[0].filename, 'screenshots/viper.webp');
  assert.equal(result[0].width, 1920);
});

test('buildWorkerScreenshots: falls back to parse_finished screenshot_uri when no visual asset exists', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro', worker_id: 'fetch-29' }),
    makeEvent('parse_finished', {
      url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
      worker_id: 'fetch-29',
      screenshot_uri: 'screenshots/rtings.jpg',
    }, { ts: '2026-02-20T00:02:00.000Z' }),
  ];

  const result = buildWorkerScreenshots(events, 'fetch-29');

  assert.equal(result.length, 1);
  assert.equal(result[0].filename, 'screenshots/rtings.jpg');
  assert.equal(result[0].url, 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro');
  assert.equal(result[0].kind, 'parse_finished');
});
