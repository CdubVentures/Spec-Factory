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

  it('idle-triggered close leads to reconnect which triggers reloadFn (hadConnection path)', async () => {
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
    // Flush the queueMicrotask in FakeWebSocket.close() that triggers onclose.
    await Promise.resolve();
    mock.timers.runAll();

    strictEqual(FakeWebSocket.instances.length, 2, 'reconnect spawned a fresh WS');
    const second = FakeWebSocket.instances[1];
    second.fireOpen();

    strictEqual(reloads, 1, 'reloadFn called on second successful open (hadConnection branch)');
    mgr.close();
  });
});
