import type { WsConnectionSnapshot } from '../../api/ws.ts';

export type WsConnectionStatusTone = 'info' | 'success' | 'warning' | 'danger';

export interface WsConnectionStatusView {
  readonly label: string;
  readonly title: string;
  readonly ariaLabel: string;
  readonly tone: WsConnectionStatusTone;
}

function formatRetryDelay(delayMs: number | null): string {
  if (delayMs === null) return '';
  if (delayMs < 1_000) return `${delayMs}ms`;
  const seconds = delayMs / 1_000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
}

export function resolveWsConnectionStatusView(snapshot: WsConnectionSnapshot): WsConnectionStatusView {
  if (snapshot.status === 'connected') {
    return {
      label: 'Live',
      title: 'WebSocket connected',
      ariaLabel: 'WebSocket connected',
      tone: 'success',
    };
  }

  if (snapshot.status === 'reconnecting') {
    const retryDelay = formatRetryDelay(snapshot.nextReconnectDelayMs);
    const retryText = retryDelay ? `; retry ${snapshot.reconnectAttempt} in ${retryDelay}` : '';
    return {
      label: 'Reconnecting',
      title: `WebSocket reconnecting${retryText}`,
      ariaLabel: `WebSocket reconnecting${retryText}`,
      tone: 'warning',
    };
  }

  if (snapshot.status === 'connecting') {
    return {
      label: 'Connecting',
      title: 'WebSocket connecting',
      ariaLabel: 'WebSocket connecting',
      tone: 'info',
    };
  }

  return {
    label: 'Offline',
    title: 'WebSocket offline',
    ariaLabel: 'WebSocket offline',
    tone: 'danger',
  };
}
