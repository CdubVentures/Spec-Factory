import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWsConnectionStatusView } from '../wsConnectionStatus.ts';

describe('resolveWsConnectionStatusView', () => {
  it('maps connected state to a live status label', () => {
    const view = resolveWsConnectionStatusView({
      status: 'connected',
      reconnectAttempt: 0,
      nextReconnectDelayMs: null,
      lastConnectedAt: '2026-04-28T00:00:00.000Z',
      lastDisconnectedAt: null,
    });

    assert.equal(view.label, 'Live');
    assert.equal(view.ariaLabel, 'WebSocket connected');
    assert.equal(view.tone, 'success');
  });

  it('maps reconnecting state with retry timing for operators', () => {
    const view = resolveWsConnectionStatusView({
      status: 'reconnecting',
      reconnectAttempt: 2,
      nextReconnectDelayMs: 1_500,
      lastConnectedAt: '2026-04-28T00:00:00.000Z',
      lastDisconnectedAt: '2026-04-28T00:01:00.000Z',
    });

    assert.equal(view.label, 'Reconnecting');
    assert.equal(view.ariaLabel, 'WebSocket reconnecting; retry 2 in 1.5s');
    assert.equal(view.tone, 'warning');
  });

  it('maps offline state to an explicit offline warning', () => {
    const view = resolveWsConnectionStatusView({
      status: 'offline',
      reconnectAttempt: 0,
      nextReconnectDelayMs: null,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
    });

    assert.equal(view.label, 'Offline');
    assert.equal(view.ariaLabel, 'WebSocket offline');
    assert.equal(view.tone, 'danger');
  });
});
