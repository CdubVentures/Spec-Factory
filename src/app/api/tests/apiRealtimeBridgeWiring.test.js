import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRealtimeBridge } from '../realtimeBridge.js';
import {
  createFakeFs,
  createWatchHarness,
  createWebSocketHarness,
  flushAsync,
  parseNdjson,
  createWsSubscription,
  createRuntimeEvent,
  createIndexLabEvent,
  createScreencastFrame,
} from './helpers/appApiTestBuilders.js';

function createRealtimeBridgeHarness(overrides = {}) {
  const watchHarness = createWatchHarness();
  const wsHarness = createWebSocketHarness();
  const fakeFs = createFakeFs(overrides.files);
  const server = new EventEmitter();
  const screencastCalls = [];

  const bridge = createRealtimeBridge({
    path,
    fs: fakeFs,
    outputRoot: overrides.outputRoot || path.resolve('out'),
    indexLabRoot: overrides.indexLabRoot || path.resolve('artifacts/indexlab'),
    parseNdjson,
    dataChangeMatchesCategory: overrides.dataChangeMatchesCategory || ((data, categoryToken) => {
      if (!categoryToken) return true;
      return String(data?.category || '').toLowerCase() === categoryToken;
    }),
    processStatus: overrides.processStatus || (() => ({ running: false })),
    forwardScreencastControl: overrides.forwardScreencastControl || ((payload) => {
      screencastCalls.push(payload);
      return true;
    }),
    watchFactory: watchHarness.watchFactory,
    webSocketServerClass: wsHarness.FakeWebSocketServer,
    screencastFrameCacheLimit: overrides.screencastFrameCacheLimit,
  });

  return {
    bridge,
    watchHarness,
    wsHarness,
    fakeFs,
    server,
    screencastCalls,
  };
}

test('realtime bridge filters subscribed event streams and forwards process-status snapshots', async () => {
  const h = createRealtimeBridgeHarness({
    processStatus: () => ({ running: true, run_id: 'run_ws_1234' }),
  });

  h.bridge.attachWebSocketUpgrade(h.server);
  h.server.emit('upgrade', { url: '/ws?category=mouse' }, { destroy: () => {} }, Buffer.alloc(0));
  assert.equal(h.wsHarness.clients.length, 1);
  const client = h.wsHarness.clients[0];

  client.emit('message', Buffer.from(JSON.stringify(createWsSubscription({
    subscribe: ['events', 'process-status'],
  }))));

  const processStatusEvent = JSON.parse(client.sent[0]);
  assert.equal(processStatusEvent.channel, 'process-status');
  assert.equal(processStatusEvent.data.run_id, 'run_ws_1234');

  h.bridge.broadcastWs('events', [
    createRuntimeEvent(),
    createRuntimeEvent({ category: 'keyboard', productId: 'keyboard-logitech-g915', stage: 'skip' }),
  ]);

  const eventsMessage = JSON.parse(client.sent[1]);
  assert.equal(eventsMessage.channel, 'events');
  assert.equal(Array.isArray(eventsMessage.data), true);
  assert.equal(eventsMessage.data.length, 1);
  assert.equal(eventsMessage.data[0].productId, 'mouse-razer-viper');
});

test('realtime bridge suppresses event broadcasts when subscribed product filters out every row', async () => {
  const h = createRealtimeBridgeHarness();

  h.bridge.attachWebSocketUpgrade(h.server);
  h.server.emit('upgrade', { url: '/ws?category=mouse' }, { destroy: () => {} }, Buffer.alloc(0));
  assert.equal(h.wsHarness.clients.length, 1);
  const client = h.wsHarness.clients[0];

  client.emit('message', Buffer.from(JSON.stringify(createWsSubscription({
    subscribe: ['events'],
    productId: 'mouse-razer-viper',
  }))));

  h.bridge.broadcastWs('events', [
    createRuntimeEvent({ productId: 'mouse-logitech-gpx-2' }),
    createRuntimeEvent({ category: 'keyboard', productId: 'keyboard-logitech-g915' }),
  ]);

  assert.deepEqual(client.sent, []);
});

test('realtime bridge forwards screencast control messages and rejects non-ws upgrades', async () => {
  const h = createRealtimeBridgeHarness();

  h.bridge.attachWebSocketUpgrade(h.server);
  h.server.emit('upgrade', { url: '/ws' }, { destroy: () => {} }, Buffer.alloc(0));
  assert.equal(h.wsHarness.clients.length, 1);
  const client = h.wsHarness.clients[0];

  client.emit('message', Buffer.from(JSON.stringify({ screencast_subscribe: 'worker-9' })));
  client.emit('message', Buffer.from(JSON.stringify({ screencast_unsubscribe: true })));
  assert.deepEqual(h.screencastCalls, [
    { subscribeWorkerId: 'worker-9' },
    { unsubscribe: true },
  ]);

  let destroyed = false;
  h.server.emit('upgrade', { url: '/not-ws' }, { destroy: () => { destroyed = true; } }, Buffer.alloc(0));
  assert.equal(destroyed, true);
});

test('realtime bridge caches the last screencast frame by run and worker', async () => {
  const h = createRealtimeBridgeHarness({
    processStatus: () => ({ running: true, run_id: 'run-cache-1' }),
  });

  h.bridge.attachWebSocketUpgrade(h.server);
  h.bridge.broadcastWs('screencast-fetch-9', createScreencastFrame());

  assert.deepEqual(h.bridge.getLastScreencastFrame('run-cache-1', 'fetch-9'), {
    run_id: 'run-cache-1',
    worker_id: 'fetch-9',
    data: 'abc123',
    width: 1280,
    height: 720,
    ts: '2026-03-08T08:10:00.000Z',
  });
  assert.equal(h.bridge.getLastScreencastFrame('run-cache-1', 'fetch-missing'), null);
  assert.equal(h.bridge.getLastScreencastFrame('run-other', 'fetch-9'), null);
});

test('realtime bridge evicts the oldest screencast frame when the cache exceeds its limit', async () => {
  const h = createRealtimeBridgeHarness({
    screencastFrameCacheLimit: 2,
  });

  h.bridge.attachWebSocketUpgrade(h.server);
  h.bridge.broadcastWs('screencast-fetch-1', createScreencastFrame({
    run_id: 'run-cache-1',
    worker_id: 'fetch-1',
    data: 'frame-1',
  }));
  h.bridge.broadcastWs('screencast-fetch-2', createScreencastFrame({
    run_id: 'run-cache-2',
    worker_id: 'fetch-2',
    data: 'frame-2',
  }));
  h.bridge.broadcastWs('screencast-fetch-3', createScreencastFrame({
    run_id: 'run-cache-3',
    worker_id: 'fetch-3',
    data: 'frame-3',
  }));

  assert.equal(h.bridge.getLastScreencastFrame('run-cache-1', 'fetch-1'), null);
  assert.equal(h.bridge.getLastScreencastFrame('run-cache-2', 'fetch-2')?.data, 'frame-2');
  assert.equal(h.bridge.getLastScreencastFrame('run-cache-3', 'fetch-3')?.data, 'frame-3');
});

test('realtime bridge treats an updated screencast frame as newest for eviction', async () => {
  const h = createRealtimeBridgeHarness({
    screencastFrameCacheLimit: 2,
  });

  h.bridge.attachWebSocketUpgrade(h.server);
  h.bridge.broadcastWs('screencast-fetch-1', createScreencastFrame({
    run_id: 'run-cache-1',
    worker_id: 'fetch-1',
    data: 'frame-1-old',
  }));
  h.bridge.broadcastWs('screencast-fetch-2', createScreencastFrame({
    run_id: 'run-cache-2',
    worker_id: 'fetch-2',
    data: 'frame-2',
  }));
  h.bridge.broadcastWs('screencast-fetch-1', createScreencastFrame({
    run_id: 'run-cache-1',
    worker_id: 'fetch-1',
    data: 'frame-1-new',
  }));
  h.bridge.broadcastWs('screencast-fetch-3', createScreencastFrame({
    run_id: 'run-cache-3',
    worker_id: 'fetch-3',
    data: 'frame-3',
  }));

  assert.equal(h.bridge.getLastScreencastFrame('run-cache-1', 'fetch-1')?.data, 'frame-1-new');
  assert.equal(h.bridge.getLastScreencastFrame('run-cache-2', 'fetch-2'), null);
  assert.equal(h.bridge.getLastScreencastFrame('run-cache-3', 'fetch-3')?.data, 'frame-3');
});
