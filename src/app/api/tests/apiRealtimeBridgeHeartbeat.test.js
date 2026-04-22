import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRealtimeBridge } from '../realtimeBridge.js';
import {
  createFakeFs,
  createWatchHarness,
  parseNdjson,
} from './helpers/appApiTestBuilders.js';

const OPEN = 1;
const CLOSED = 3;

function createHeartbeatHarness({ heartbeatMs = 0 } = {}) {
  const clients = [];
  class FakeWebSocketServer {
    constructor(options) { this.options = options; }
    handleUpgrade(_req, _socket, _head, callback) {
      const client = new EventEmitter();
      client.readyState = OPEN;
      client.sent = [];
      client.pings = 0;
      client.terminated = false;
      client.send = (message) => { client.sent.push(String(message)); };
      client.ping = () => { client.pings += 1; };
      client.terminate = () => {
        client.terminated = true;
        client.readyState = CLOSED;
        client.emit('close');
      };
      clients.push(client);
      callback(client);
    }
  }

  const bridge = createRealtimeBridge({
    path,
    fs: createFakeFs(),
    outputRoot: path.resolve('out'),
    indexLabRoot: path.resolve('artifacts/indexlab'),
    parseNdjson,
    dataChangeMatchesCategory: () => true,
    processStatus: () => ({ running: false }),
    forwardScreencastControl: () => true,
    watchFactory: createWatchHarness().watchFactory,
    webSocketServerClass: FakeWebSocketServer,
    heartbeatMs,
  });

  const server = new EventEmitter();
  bridge.attachWebSocketUpgrade(server);

  function upgrade() {
    server.emit('upgrade', { url: '/ws' }, { destroy: () => {} }, Buffer.alloc(0));
    return clients[clients.length - 1];
  }

  return { bridge, clients, server, upgrade };
}

test('heartbeat: tick pings all OPEN clients and marks them not-alive', () => {
  const h = createHeartbeatHarness();
  const a = h.upgrade();
  const b = h.upgrade();

  h.bridge.tickHeartbeat();

  assert.equal(a.pings, 1, 'client a was pinged');
  assert.equal(b.pings, 1, 'client b was pinged');
  assert.equal(a.terminated, false);
  assert.equal(b.terminated, false);
  h.bridge.stopHeartbeat();
});

test('heartbeat: second tick terminates client that did not pong', () => {
  const h = createHeartbeatHarness();
  const a = h.upgrade();

  h.bridge.tickHeartbeat();
  h.bridge.tickHeartbeat();

  assert.equal(a.terminated, true, 'stale client terminated');
  assert.equal(a.pings, 1, 'no second ping on a dead client');
  h.bridge.stopHeartbeat();
});

test('heartbeat: pong resets alive flag so client survives next tick', () => {
  const h = createHeartbeatHarness();
  const a = h.upgrade();

  h.bridge.tickHeartbeat();
  a.emit('pong');
  h.bridge.tickHeartbeat();

  assert.equal(a.terminated, false);
  assert.equal(a.pings, 2);
  h.bridge.stopHeartbeat();
});

test('heartbeat: pong from one client does not save another', () => {
  const h = createHeartbeatHarness();
  const a = h.upgrade();
  const b = h.upgrade();

  h.bridge.tickHeartbeat();
  a.emit('pong');
  h.bridge.tickHeartbeat();

  assert.equal(a.terminated, false, 'a ponged and survives');
  assert.equal(b.terminated, true, 'b did not pong and is terminated');
  h.bridge.stopHeartbeat();
});

test('heartbeat: clients with non-OPEN readyState are skipped', () => {
  const h = createHeartbeatHarness();
  const a = h.upgrade();
  a.readyState = CLOSED;

  h.bridge.tickHeartbeat();

  assert.equal(a.pings, 0, 'closed client not pinged');
  assert.equal(a.terminated, false, 'closed client not terminated');
  h.bridge.stopHeartbeat();
});

test('heartbeat: terminated client is removed from broadcast roster', () => {
  const h = createHeartbeatHarness();
  const a = h.upgrade();

  h.bridge.tickHeartbeat();
  h.bridge.tickHeartbeat();
  const sentBeforeOpBroadcast = a.sent.length;

  h.bridge.broadcastWs('operations', { action: 'upsert', id: 'op-1' });
  assert.equal(a.sent.length, sentBeforeOpBroadcast, 'terminated client receives no further broadcast');
  h.bridge.stopHeartbeat();
});

test('heartbeat: new client from upgrade joins alive', () => {
  const h = createHeartbeatHarness();
  h.bridge.tickHeartbeat();
  const fresh = h.upgrade();

  h.bridge.tickHeartbeat();

  assert.equal(fresh.terminated, false, 'fresh client not terminated on first tick after upgrade');
  assert.equal(fresh.pings, 1, 'fresh client pinged once');
  h.bridge.stopHeartbeat();
});

test('heartbeat: stopHeartbeat is idempotent', () => {
  const h = createHeartbeatHarness();
  h.bridge.stopHeartbeat();
  h.bridge.stopHeartbeat();
});

test('heartbeat: heartbeatMs=0 does not schedule automatic ticks but manual tick still works', () => {
  const h = createHeartbeatHarness({ heartbeatMs: 0 });
  const a = h.upgrade();

  h.bridge.tickHeartbeat();
  assert.equal(a.pings, 1, 'manual tick works even when interval is disabled');
  h.bridge.stopHeartbeat();
});

test('heartbeat: multiple attachWebSocketUpgrade calls do not stack intervals', () => {
  const h = createHeartbeatHarness();
  const server2 = new EventEmitter();
  const wsServer1 = h.bridge.attachWebSocketUpgrade(h.server);
  const wsServer2 = h.bridge.attachWebSocketUpgrade(server2);

  assert.equal(wsServer1, wsServer2, 'attachWebSocketUpgrade is idempotent');
  h.bridge.stopHeartbeat();
});

test('heartbeat: pong on alive client keeps it marked alive (idempotent)', () => {
  const h = createHeartbeatHarness();
  const a = h.upgrade();
  a.emit('pong');
  a.emit('pong');

  h.bridge.tickHeartbeat();

  assert.equal(a.pings, 1);
  assert.equal(a.terminated, false);
  h.bridge.stopHeartbeat();
});

test('heartbeat: tick broadcasts a heartbeat message so idle clients see traffic', () => {
  const h = createHeartbeatHarness();
  const a = h.upgrade();
  a.emit('message', Buffer.from(JSON.stringify({ subscribe: ['heartbeat'] })));

  h.bridge.tickHeartbeat();

  const frames = a.sent.map((raw) => JSON.parse(raw));
  const heartbeats = frames.filter((f) => f.channel === 'heartbeat');
  assert.equal(heartbeats.length, 1, 'one heartbeat frame per tick');
  assert.ok(typeof heartbeats[0].ts === 'string' && heartbeats[0].ts.length > 0, 'heartbeat carries a ts');
  h.bridge.stopHeartbeat();
});

test('heartbeat: broadcast delivers heartbeat to clients with no subscription filter', () => {
  const h = createHeartbeatHarness();
  const a = h.upgrade();

  h.bridge.tickHeartbeat();

  const frames = a.sent.map((raw) => JSON.parse(raw));
  const heartbeats = frames.filter((f) => f.channel === 'heartbeat');
  assert.equal(heartbeats.length, 1, 'unsubscribed clients receive heartbeat too');
  h.bridge.stopHeartbeat();
});
