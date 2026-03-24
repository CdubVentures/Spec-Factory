import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRealtimeBridge } from '../realtimeBridge.js';

function createFakeFs(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles).map(([key, value]) => [key, String(value)]));

  return {
    setFile(filePath, content) {
      files.set(filePath, String(content || ''));
    },
    async stat(filePath) {
      const payload = String(files.get(filePath) || '');
      return { size: Buffer.byteLength(payload, 'utf8') };
    },
    async open(filePath) {
      const payload = Buffer.from(String(files.get(filePath) || ''), 'utf8');
      return {
        async read(buffer, offset, length, position) {
          payload.copy(buffer, offset, position, position + length);
          return { bytesRead: length, buffer };
        },
        async close() {},
      };
    },
  };
}

function createWatchHarness() {
  const watchers = [];
  return {
    watchers,
    watchFactory(target) {
      const watcher = new EventEmitter();
      watcher.target = target;
      watchers.push(watcher);
      return watcher;
    },
  };
}

function createWebSocketHarness() {
  const clients = [];
  class FakeWebSocketServer {
    constructor(options) {
      this.options = options;
    }

    handleUpgrade(_req, _socket, _head, callback) {
      const client = new EventEmitter();
      client.readyState = 1;
      client.sent = [];
      client.send = (message) => {
        client.sent.push(String(message));
      };
      clients.push(client);
      callback(client);
    }
  }

  return { clients, FakeWebSocketServer };
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function parseNdjson(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

test('realtime bridge upgrade wiring preserves ws filtering, process-status snapshots, and screencast forwarding', async () => {
  const watchHarness = createWatchHarness();
  const wsHarness = createWebSocketHarness();
  const fakeFs = createFakeFs();
  const screencastCalls = [];
  const server = new EventEmitter();

  const bridge = createRealtimeBridge({
    path,
    fs: fakeFs,
    outputRoot: path.resolve('out'),
    indexLabRoot: path.resolve('artifacts/indexlab'),
    parseNdjson,
    dataChangeMatchesCategory: (data, categoryToken) => {
      if (!categoryToken) return true;
      return String(data?.category || '').toLowerCase() === categoryToken;
    },
    processStatus: () => ({ running: true, run_id: 'run_ws_1234' }),
    forwardScreencastControl: (payload) => {
      screencastCalls.push(payload);
      return true;
    },
    watchFactory: watchHarness.watchFactory,
    webSocketServerClass: wsHarness.FakeWebSocketServer,
  });

  bridge.attachWebSocketUpgrade(server);
  server.emit('upgrade', { url: '/ws?category=mouse' }, { destroy: () => {} }, Buffer.alloc(0));
  assert.equal(wsHarness.clients.length, 1);
  const client = wsHarness.clients[0];

  client.emit('message', Buffer.from(JSON.stringify({
    subscribe: ['events', 'process-status'],
    category: 'mouse',
    productId: 'mouse-razer-viper',
  })));

  assert.equal(client.sent.length >= 1, true);
  const processStatusEvent = JSON.parse(client.sent[0]);
  assert.equal(processStatusEvent.channel, 'process-status');
  assert.equal(processStatusEvent.data.run_id, 'run_ws_1234');

  bridge.broadcastWs('events', [
    { category: 'mouse', productId: 'mouse-razer-viper', stage: 'ok' },
    { category: 'keyboard', productId: 'keyboard-logitech-g915', stage: 'skip' },
  ]);
  const eventsMessage = JSON.parse(client.sent[1]);
  assert.equal(eventsMessage.channel, 'events');
  assert.equal(Array.isArray(eventsMessage.data), true);
  assert.equal(eventsMessage.data.length, 1);
  assert.equal(eventsMessage.data[0].productId, 'mouse-razer-viper');

  client.emit('message', Buffer.from(JSON.stringify({ screencast_subscribe: 'worker-9' })));
  client.emit('message', Buffer.from(JSON.stringify({ screencast_unsubscribe: true })));
  assert.deepEqual(screencastCalls, [
    { subscribeWorkerId: 'worker-9' },
    { unsubscribe: true },
  ]);
});

test('realtime bridge rejects non-ws upgrade requests', async () => {
  const watchHarness = createWatchHarness();
  const wsHarness = createWebSocketHarness();
  const fakeFs = createFakeFs();
  const server = new EventEmitter();
  let destroyed = false;

  const bridge = createRealtimeBridge({
    path,
    fs: fakeFs,
    outputRoot: path.resolve('out'),
    indexLabRoot: path.resolve('artifacts/indexlab'),
    parseNdjson,
    dataChangeMatchesCategory: () => true,
    processStatus: () => ({ running: false }),
    forwardScreencastControl: () => false,
    watchFactory: watchHarness.watchFactory,
    webSocketServerClass: wsHarness.FakeWebSocketServer,
  });

  bridge.attachWebSocketUpgrade(server);
  server.emit('upgrade', { url: '/not-ws' }, { destroy: () => { destroyed = true; } }, Buffer.alloc(0));
  assert.equal(destroyed, true);
  assert.equal(wsHarness.clients.length, 0);
});

test('realtime bridge watcher fanout publishes runtime and indexlab deltas', async () => {
  const outputRoot = path.resolve('out');
  const indexLabRoot = path.resolve('artifacts/indexlab');
  const eventsPath = path.join(outputRoot, '_runtime', 'events.jsonl');
  const runFilePath = path.join(indexLabRoot, 'run-1', 'run_events.ndjson');

  const fakeFs = createFakeFs({
    [eventsPath]: `${JSON.stringify({ category: 'mouse', productId: 'mouse-razer-viper' })}\n`,
    [runFilePath]: `${JSON.stringify({ category: 'mouse', product_id: 'mouse-razer-viper', event: 'parse_done' })}\n`,
  });
  const watchHarness = createWatchHarness();
  const wsHarness = createWebSocketHarness();
  const server = new EventEmitter();

  const bridge = createRealtimeBridge({
    path,
    fs: fakeFs,
    outputRoot,
    indexLabRoot,
    parseNdjson,
    dataChangeMatchesCategory: () => true,
    processStatus: () => ({ running: false }),
    forwardScreencastControl: () => false,
    watchFactory: watchHarness.watchFactory,
    webSocketServerClass: wsHarness.FakeWebSocketServer,
  });

  bridge.attachWebSocketUpgrade(server);
  server.emit('upgrade', { url: '/ws' }, { destroy: () => {} }, Buffer.alloc(0));
  assert.equal(wsHarness.clients.length, 1);
  const client = wsHarness.clients[0];
  client.emit('message', Buffer.from(JSON.stringify({
    subscribe: ['events', 'indexlab-event'],
  })));

  const watchers = bridge.setupWatchers();
  assert.ok(watchers.eventsWatcher);
  assert.ok(watchers.indexlabWatcher);
  assert.equal(watchHarness.watchers.length, 2);

  watchHarness.watchers[0].emit('change');
  await flushAsync();

  watchHarness.watchers[1].emit('add', runFilePath);
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

test('realtime bridge caches the last screencast frame by run and worker', async () => {
  const watchHarness = createWatchHarness();
  const wsHarness = createWebSocketHarness();
  const fakeFs = createFakeFs();
  const server = new EventEmitter();

  const bridge = createRealtimeBridge({
    path,
    fs: fakeFs,
    outputRoot: path.resolve('out'),
    indexLabRoot: path.resolve('artifacts/indexlab'),
    parseNdjson,
    dataChangeMatchesCategory: () => true,
    processStatus: () => ({ running: true, run_id: 'run-cache-1' }),
    forwardScreencastControl: () => false,
    watchFactory: watchHarness.watchFactory,
    webSocketServerClass: wsHarness.FakeWebSocketServer,
  });

  bridge.attachWebSocketUpgrade(server);
  bridge.broadcastWs('screencast-fetch-9', {
    __screencast: true,
    channel: 'screencast-fetch-9',
    worker_id: 'fetch-9',
    data: 'abc123',
    width: 1280,
    height: 720,
    ts: '2026-03-08T08:10:00.000Z',
  });

  assert.deepEqual(bridge.getLastScreencastFrame('run-cache-1', 'fetch-9'), {
    run_id: 'run-cache-1',
    worker_id: 'fetch-9',
    data: 'abc123',
    width: 1280,
    height: 720,
    ts: '2026-03-08T08:10:00.000Z',
  });
  assert.equal(bridge.getLastScreencastFrame('run-cache-1', 'fetch-missing'), null);
  assert.equal(bridge.getLastScreencastFrame('run-other', 'fetch-9'), null);
});
