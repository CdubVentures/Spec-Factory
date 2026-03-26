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

test('realtime bridge watcher fanout publishes runtime and indexlab deltas', async () => {
  const outputRoot = path.resolve('out');
  const indexLabRoot = path.resolve('artifacts/indexlab');
  const eventsPath = path.join(outputRoot, '_runtime', 'events.jsonl');
  const runFilePath = path.join(indexLabRoot, 'run-1', 'run_events.ndjson');
  const h = createRealtimeBridgeHarness({
    outputRoot,
    indexLabRoot,
    files: {
      [eventsPath]: `${JSON.stringify(createRuntimeEvent())}\n`,
      [runFilePath]: `${JSON.stringify(createIndexLabEvent())}\n`,
    },
  });

  h.bridge.attachWebSocketUpgrade(h.server);
  h.server.emit('upgrade', { url: '/ws' }, { destroy: () => {} }, Buffer.alloc(0));
  assert.equal(h.wsHarness.clients.length, 1);
  const client = h.wsHarness.clients[0];
  client.emit('message', Buffer.from(JSON.stringify(createWsSubscription({
    subscribe: ['events', 'indexlab-event'],
    category: '',
    productId: '',
  }))));

  const watchers = h.bridge.setupWatchers();
  assert.ok(watchers.eventsWatcher);
  assert.ok(watchers.indexlabWatcher);
  assert.equal(h.watchHarness.watchers.length, 2);

  h.watchHarness.watchers[0].emit('change');
  await flushAsync();

  h.watchHarness.watchers[1].emit('add', runFilePath);
  await flushAsync();

  const channels = client.sent.map((raw) => {
    try {
      return JSON.parse(raw).channel;
    } catch {
      return '';
    }
  });
  assert.equal(channels.includes('events'), true);
  assert.equal(channels.includes('indexlab-event'), true);
});

test('realtime bridge indexlab watcher only publishes appended rows on subsequent changes', async () => {
  const indexLabRoot = path.resolve('artifacts/indexlab');
  const runFilePath = path.join(indexLabRoot, 'run-1', 'run_events.ndjson');
  const firstRow = createIndexLabEvent();
  const secondRow = createIndexLabEvent({ event: 'fetch_done' });
  const h = createRealtimeBridgeHarness({
    indexLabRoot,
    files: {
      [runFilePath]: `${JSON.stringify(firstRow)}\n`,
    },
  });

  h.bridge.attachWebSocketUpgrade(h.server);
  h.server.emit('upgrade', { url: '/ws' }, { destroy: () => {} }, Buffer.alloc(0));
  assert.equal(h.wsHarness.clients.length, 1);
  const client = h.wsHarness.clients[0];

  client.emit('message', Buffer.from(JSON.stringify(createWsSubscription({
    subscribe: ['indexlab-event'],
    category: '',
    productId: '',
  }))));

  h.bridge.setupWatchers();

  h.watchHarness.watchers[1].emit('add', runFilePath);
  await flushAsync();

  h.fakeFs.setFile(
    runFilePath,
    `${JSON.stringify(firstRow)}\n${JSON.stringify(secondRow)}\n`,
  );
  h.watchHarness.watchers[1].emit('change', runFilePath);
  await flushAsync();

  const messages = client.sent.map((raw) => JSON.parse(raw));
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], {
    channel: 'indexlab-event',
    data: [firstRow],
    ts: messages[0].ts,
  });
  assert.deepEqual(messages[1], {
    channel: 'indexlab-event',
    data: [secondRow],
    ts: messages[1].ts,
  });
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
