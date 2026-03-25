import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexLabRuntimeBridge } from '../runtimeBridge.js';

test('broadcastScreencastFrame emits frame with __screencast flag via onEvent', () => {
  const events = [];
  const bridge = new IndexLabRuntimeBridge({
    outRoot: '/tmp/test-screencast',
    onEvent: (ev) => events.push(ev),
  });

  bridge.broadcastScreencastFrame({
    worker_id: 'fetch-1',
    data: 'base64JpegPayload',
    width: 1280,
    height: 720,
    ts: '2026-02-20T00:01:00.000Z',
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].__screencast, true);
  assert.equal(events[0].channel, 'screencast-fetch-1');
  assert.equal(events[0].worker_id, 'fetch-1');
  assert.equal(events[0].data, 'base64JpegPayload');
  assert.equal(events[0].width, 1280);
  assert.equal(events[0].height, 720);
});

test('broadcastScreencastFrame does nothing when onEvent is null', () => {
  const bridge = new IndexLabRuntimeBridge({
    outRoot: '/tmp/test-screencast',
    onEvent: null,
  });

  bridge.broadcastScreencastFrame({
    worker_id: 'fetch-1',
    data: 'base64JpegPayload',
    width: 1280,
    height: 720,
  });

  assert.ok(true, 'no error thrown when onEvent is null');
});

test('selective streaming filters by worker_id when screencastTarget is set', () => {
  const events = [];
  const bridge = new IndexLabRuntimeBridge({
    outRoot: '/tmp/test-screencast',
    onEvent: (ev) => events.push(ev),
  });

  bridge.screencastTarget = 'fetch-3';

  bridge.broadcastScreencastFrame({
    worker_id: 'fetch-1',
    data: 'should-be-dropped',
    width: 1280,
    height: 720,
  });

  bridge.broadcastScreencastFrame({
    worker_id: 'fetch-3',
    data: 'should-be-forwarded',
    width: 1280,
    height: 720,
  });

  assert.equal(events.length, 1, 'only matching worker frame forwarded');
  assert.equal(events[0].worker_id, 'fetch-3');
  assert.equal(events[0].data, 'should-be-forwarded');
});

test('selective streaming passes all frames when screencastTarget is wildcard', () => {
  const events = [];
  const bridge = new IndexLabRuntimeBridge({
    outRoot: '/tmp/test-screencast',
    onEvent: (ev) => events.push(ev),
  });

  bridge.screencastTarget = '*';

  bridge.broadcastScreencastFrame({
    worker_id: 'fetch-1',
    data: 'frame-1',
    width: 1280,
    height: 720,
  });

  bridge.broadcastScreencastFrame({
    worker_id: 'fetch-2',
    data: 'frame-2',
    width: 1280,
    height: 720,
  });

  assert.equal(events.length, 2, 'wildcard passes all frames');
});

test('selective streaming passes all frames when screencastTarget is empty', () => {
  const events = [];
  const bridge = new IndexLabRuntimeBridge({
    outRoot: '/tmp/test-screencast',
    onEvent: (ev) => events.push(ev),
  });

  bridge.screencastTarget = '';

  bridge.broadcastScreencastFrame({
    worker_id: 'fetch-1',
    data: 'frame-1',
    width: 1280,
    height: 720,
  });

  assert.equal(events.length, 1, 'empty target passes all frames');
});

// WHY: PlaywrightFetcher tests removed — playwrightFetcher.js deleted during crawl pipeline rework.
