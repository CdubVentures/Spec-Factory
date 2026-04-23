import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import { strictEqual } from 'node:assert';
import { WsManager } from '../ws.ts';

type Handler = (() => void) | ((evt: { data: string }) => void);

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  static reset() { FakeWebSocket.instances = []; }

  url: string;
  readyState = 0;
  onopen: Handler | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onclose: Handler | null = null;
  onerror: Handler | null = null;
  sent: string[] = [];
  closedCount = 0;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  send(msg: string) { this.sent.push(msg); }
  close() {
    this.closedCount += 1;
    this.readyState = FakeWebSocket.CLOSED;
    queueMicrotask(() => { (this.onclose as (() => void) | null)?.(); });
  }
  // Simulate server opening the connection.
  fireOpen() {
    this.readyState = FakeWebSocket.OPEN;
    (this.onopen as (() => void) | null)?.();
  }
  // Simulate a message arriving from the server.
  fireMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('WsManager idle watchdog', () => {
  beforeEach(() => {
    FakeWebSocket.reset();
    mock.timers.enable({ apis: ['setTimeout'] });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('closes the socket after idleTimeoutMs of no messages', () => {
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 60_000,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => {},
    });
    mgr.connect();
    const ws = FakeWebSocket.instances[0];
    ws.fireOpen();

    mock.timers.tick(59_999);
    strictEqual(ws.closedCount, 0, 'not yet closed before timeout');

    mock.timers.tick(1);
    strictEqual(ws.closedCount, 1, 'closed after timeout elapses');

    mgr.close();
  });

  it('resets the idle timer on each incoming message', () => {
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 60_000,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => {},
    });
    mgr.connect();
    const ws = FakeWebSocket.instances[0];
    ws.fireOpen();

    mock.timers.tick(50_000);
    ws.fireMessage({ channel: 'heartbeat', data: { ts: 't' } });
    mock.timers.tick(50_000);

    strictEqual(ws.closedCount, 0, 'timer was reset, not fired');
    mock.timers.tick(10_000);
    strictEqual(ws.closedCount, 1, 'timer fires 60s after last message');

    mgr.close();
  });

  it('idleTimeoutMs=0 disables the watchdog', () => {
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 0,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => {},
    });
    mgr.connect();
    const ws = FakeWebSocket.instances[0];
    ws.fireOpen();

    mock.timers.tick(10 * 60_000);

    strictEqual(ws.closedCount, 0, 'no close without idle watchdog');
    mgr.close();
  });

  it('manual close clears the idle timer so it does not fire later', () => {
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 60_000,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => {},
    });
    mgr.connect();
    const ws = FakeWebSocket.instances[0];
    ws.fireOpen();

    mgr.close();
    const baselineClosedCount = ws.closedCount;

    mock.timers.tick(60_000);
    strictEqual(ws.closedCount, baselineClosedCount, 'no additional close from idle timer');
  });

  it('heartbeat channel messages reset the idle timer (keeps idle sessions alive)', () => {
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 60_000,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => {},
    });
    mgr.connect();
    const ws = FakeWebSocket.instances[0];
    ws.fireOpen();

    for (let i = 0; i < 5; i += 1) {
      mock.timers.tick(30_000);
      ws.fireMessage({ channel: 'heartbeat', data: { ts: `t${i}` } });
    }

    strictEqual(ws.closedCount, 0, 'periodic heartbeats prevent the watchdog from firing');
    mgr.close();
  });

  it('idle-triggered close leads to reconnect which fires onReconnect (no reload when handler is registered)', async () => {
    let reloads = 0;
    let reconnects = 0;
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 60_000,
      reconnectMs: 1_000,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => { reloads += 1; },
    });
    mgr.onReconnect(() => { reconnects += 1; });
    mgr.connect();
    const first = FakeWebSocket.instances[0];
    first.fireOpen();

    mock.timers.tick(60_000);
    await Promise.resolve();
    mock.timers.runAll();

    strictEqual(FakeWebSocket.instances.length, 2, 'reconnect spawned a fresh WS');
    const second = FakeWebSocket.instances[1];
    second.fireOpen();

    strictEqual(reconnects, 1, 'onReconnect handler called on the hadConnection branch');
    strictEqual(reloads, 0, 'reloadFn NOT called when onReconnect handler exists');
    mgr.close();
  });

  it('reconnect with no onReconnect handlers falls back to reloadFn', async () => {
    let reloads = 0;
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 60_000,
      reconnectMs: 1_000,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => { reloads += 1; },
    });
    mgr.connect();
    const first = FakeWebSocket.instances[0];
    first.fireOpen();

    mock.timers.tick(60_000);
    await Promise.resolve();
    mock.timers.runAll();
    const second = FakeWebSocket.instances[1];
    second.fireOpen();

    strictEqual(reloads, 1, 'reloadFn is the fallback when no handlers are registered');
    mgr.close();
  });

  it('first successful connect does not fire onReconnect', () => {
    let reconnects = 0;
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 60_000,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => {},
    });
    mgr.onReconnect(() => { reconnects += 1; });
    mgr.connect();
    const ws = FakeWebSocket.instances[0];
    ws.fireOpen();

    strictEqual(reconnects, 0, 'onReconnect is reconnect-only, not first-connect');
    mgr.close();
  });

  it('unsubscribed onReconnect handler is not called', async () => {
    let calls = 0;
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 60_000,
      reconnectMs: 1_000,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => {},
    });
    const unsub = mgr.onReconnect(() => { calls += 1; });
    mgr.connect();
    FakeWebSocket.instances[0].fireOpen();

    unsub();

    mock.timers.tick(60_000);
    await Promise.resolve();
    mock.timers.runAll();
    FakeWebSocket.instances[1].fireOpen();

    strictEqual(calls, 0, 'unsubscribed handler does not run');
    mgr.close();
  });

  it('throwing onReconnect handler does not prevent other handlers from running', async () => {
    let goodCalls = 0;
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 60_000,
      reconnectMs: 1_000,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => {},
    });
    mgr.onReconnect(() => { throw new Error('bad handler'); });
    mgr.onReconnect(() => { goodCalls += 1; });
    mgr.connect();
    FakeWebSocket.instances[0].fireOpen();

    mock.timers.tick(60_000);
    await Promise.resolve();
    mock.timers.runAll();
    FakeWebSocket.instances[1].fireOpen();

    strictEqual(goodCalls, 1, 'second handler still ran despite first throwing');
    mgr.close();
  });

  it('subscribe() stores only the latest call (single-slot contract — callers must NOT narrow an app-level subscription)', () => {
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 0,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => {},
    });
    mgr.connect();
    const ws = FakeWebSocket.instances[0];
    ws.fireOpen();

    mgr.subscribe(['events', 'operations', 'data-change'] as Parameters<WsManager['subscribe']>[0], 'mouse');
    const framesAfterFirst = ws.sent.length;
    mgr.subscribe(['indexlab-event'] as Parameters<WsManager['subscribe']>[0], 'mouse');

    const lastFrame = JSON.parse(ws.sent[ws.sent.length - 1]);
    strictEqual(
      Array.isArray(lastFrame.subscribe) && lastFrame.subscribe.length === 1 && lastFrame.subscribe[0] === 'indexlab-event',
      true,
      'second subscribe() overwrites the first — this is the single-slot contract',
    );
    strictEqual(ws.sent.length > framesAfterFirst, true, 'second subscribe sends a fresh frame');
    mgr.close();
  });

  it('onMessage handlers stack and receive the same broadcast (no re-subscribe needed)', () => {
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 0,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => {},
    });
    mgr.connect();
    const ws = FakeWebSocket.instances[0];
    ws.fireOpen();

    let hitsA = 0;
    let hitsB = 0;
    mgr.onMessage(() => { hitsA += 1; });
    mgr.onMessage(() => { hitsB += 1; });

    ws.fireMessage({ channel: 'indexlab-event', data: {} });

    strictEqual(hitsA, 1, 'handler A received the broadcast');
    strictEqual(hitsB, 1, 'handler B received the same broadcast');
    mgr.close();
  });

  it('reconnect re-applies existing subscription so the new socket picks up filters', async () => {
    const mgr = new WsManager({
      url: 'ws://fake/ws',
      idleTimeoutMs: 60_000,
      reconnectMs: 1_000,
      webSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      reloadFn: () => {},
    });
    mgr.onReconnect(() => {});
    mgr.connect();
    const first = FakeWebSocket.instances[0];
    first.fireOpen();
    mgr.subscribe(['operations'] as unknown as Parameters<WsManager['subscribe']>[0], 'mouse');
    const subscribeFramesFirst = first.sent.length;

    mock.timers.tick(60_000);
    await Promise.resolve();
    mock.timers.runAll();
    const second = FakeWebSocket.instances[1];
    second.fireOpen();

    strictEqual(second.sent.length >= 1, true, 'subscription re-sent on reconnect');
    strictEqual(subscribeFramesFirst >= 1, true, 'sanity: first socket also got initial subscription');
    mgr.close();
  });
});
