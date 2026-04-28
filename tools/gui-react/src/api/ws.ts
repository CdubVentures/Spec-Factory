type Channel = 'events' | 'process' | 'process-status' | 'data-change' | 'test-import-progress' | 'test-run-progress' | 'test-repair-progress' | 'indexlab-event' | 'operations' | 'llm-stream' | 'heartbeat';
type MessageHandler = (channel: Channel, data: unknown) => void;
export type WsConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';
export interface WsConnectionSnapshot {
  readonly status: WsConnectionStatus;
  readonly reconnectAttempt: number;
  readonly nextReconnectDelayMs: number | null;
  readonly lastConnectedAt: string | null;
  readonly lastDisconnectedAt: string | null;
}
type ConnectionHandler = (snapshot: WsConnectionSnapshot) => void;

interface WsManagerOptions {
  url?: string;
  reconnectMs?: number;
  maxReconnectMs?: number;
  // WHY: Client-side watchdog for half-open TCP. Server pings every 30s and
  // sends an app-level 'heartbeat' channel message. Missing traffic for
  // idleTimeoutMs (60s default = 2 server heartbeats) = dead link → force close,
  // which trips onclose → reconnect → hadConnection → reload.
  idleTimeoutMs?: number;
  // Test seams — default to browser globals.
  webSocketClass?: typeof WebSocket;
  reloadFn?: () => void;
}

function defaultWsUrl(): string {
  if (typeof window === 'undefined') return '';
  const loc = window.location;
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws`;
}

function defaultReload(): void {
  if (typeof window !== 'undefined') window.location.reload();
}

const INITIAL_CONNECTION_SNAPSHOT: WsConnectionSnapshot = Object.freeze({
  status: 'offline',
  reconnectAttempt: 0,
  nextReconnectDelayMs: null,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
});

export class WsManager {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectMs: number;
  private maxReconnectMs: number;
  private currentDelay: number;
  private handlers = new Set<MessageHandler>();
  private reconnectHandlers = new Set<() => void>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private connectionSnapshot: WsConnectionSnapshot = INITIAL_CONNECTION_SNAPSHOT;
  private subscriptions: { channels: Channel[]; category?: string; productId?: string } | null = null;
  private closed = false;
  private hadConnection = false;

  private idleTimeoutMs: number;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private webSocketClass: typeof WebSocket;
  private reloadFn: () => void;

  constructor(opts: WsManagerOptions = {}) {
    this.url = opts.url || defaultWsUrl();
    this.reconnectMs = opts.reconnectMs || 1000;
    this.maxReconnectMs = opts.maxReconnectMs || 30000;
    this.currentDelay = this.reconnectMs;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 60000;
    this.webSocketClass = opts.webSocketClass ?? (typeof WebSocket !== 'undefined' ? WebSocket : (null as unknown as typeof WebSocket));
    this.reloadFn = opts.reloadFn ?? defaultReload;
  }

  private setConnectionSnapshot(snapshot: WsConnectionSnapshot): void {
    const current = this.connectionSnapshot;
    if (
      current.status === snapshot.status
      && current.reconnectAttempt === snapshot.reconnectAttempt
      && current.nextReconnectDelayMs === snapshot.nextReconnectDelayMs
      && current.lastConnectedAt === snapshot.lastConnectedAt
      && current.lastDisconnectedAt === snapshot.lastDisconnectedAt
    ) {
      return;
    }
    this.connectionSnapshot = snapshot;
    for (const handler of this.connectionHandlers) {
      try { handler(snapshot); } catch (err) { console.error('[ws] connection handler failed:', err); }
    }
  }

  private updateConnectionStatus(
    status: WsConnectionStatus,
    patch: Partial<Omit<WsConnectionSnapshot, 'status'>> = {},
  ): void {
    this.setConnectionSnapshot({
      ...this.connectionSnapshot,
      ...patch,
      status,
    });
  }

  private resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.idleTimeoutMs <= 0) return;
    this.idleTimer = setTimeout(() => {
      // WHY: Silence beyond idleTimeoutMs means the TCP is likely half-open.
      // close() kicks the onclose reconnect path; hadConnection then reloads.
      this.ws?.close();
    }, this.idleTimeoutMs);
  }

  private clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  connect() {
    if (this.ws) return;
    this.closed = false;
    if (!this.hadConnection) {
      this.updateConnectionStatus('connecting', { nextReconnectDelayMs: null });
    }
    this.ws = new this.webSocketClass(this.url);

    this.ws.onopen = () => {
      this.updateConnectionStatus('connected', {
        reconnectAttempt: 0,
        nextReconnectDelayMs: null,
        lastConnectedAt: new Date().toISOString(),
      });
      if (this.hadConnection) {
        // WHY: Soft reconnect. Instead of the heavy-handed window.location.reload(),
        // notify registered handlers so the app can invalidate caches + rehydrate
        // operations without losing UI state (modals, filters, scroll position).
        // reloadFn is kept as the fallback for when no handler is wired — safer
        // than silently running with stale state.
        if (this.reconnectHandlers.size === 0) {
          this.reloadFn();
          return;
        }
        for (const handler of this.reconnectHandlers) {
          try { handler(); } catch (err) { console.error('[ws] reconnect handler failed:', err); }
        }
        this.currentDelay = this.reconnectMs;
        if (this.subscriptions) {
          this.ws?.send(JSON.stringify({ subscribe: this.subscriptions.channels, ...this.subscriptions }));
        }
        this.resetIdleTimer();
        return;
      }
      this.hadConnection = true;
      this.currentDelay = this.reconnectMs;
      if (this.subscriptions) {
        this.ws?.send(JSON.stringify({ subscribe: this.subscriptions.channels, ...this.subscriptions }));
      }
      this.resetIdleTimer();
    };

    this.ws.onmessage = (evt) => {
      this.resetIdleTimer();
      let msg: { channel?: Channel; data?: unknown };
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      const channel = msg.channel as Channel;
      for (const handler of this.handlers) {
        try {
          handler(channel, msg.data);
        } catch (err) {
          console.error('[ws] message handler failed:', err);
        }
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.clearIdleTimer();
      if (this.closed) {
        if (this.connectionSnapshot.status !== 'offline') {
          this.updateConnectionStatus('offline', {
            nextReconnectDelayMs: null,
            lastDisconnectedAt: new Date().toISOString(),
          });
        }
        return;
      }
      const reconnectDelay = this.currentDelay;
      this.updateConnectionStatus('reconnecting', {
        reconnectAttempt: this.connectionSnapshot.reconnectAttempt + 1,
        nextReconnectDelayMs: reconnectDelay,
        lastDisconnectedAt: new Date().toISOString(),
      });
      setTimeout(() => this.connect(), reconnectDelay);
      this.currentDelay = Math.min(this.currentDelay * 1.5, this.maxReconnectMs);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  /**
   * Set the app-level subscription. SINGLE SLOT — this overwrites any previous
   * subscription. Call this exactly once at the app shell (see
   * `useWsEventBridge`). Do NOT call this from pages to narrow scope — doing so
   * silently drops every channel you didn't list, breaking features that rely
   * on app-level broadcasts (operations, data-change, llm-stream, heartbeat).
   * To receive channel data on a page, register an onMessage handler instead;
   * handlers are additive.
   */
  subscribe(channels: Channel[], category?: string, productId?: string) {
    this.subscriptions = { channels, category, productId };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ subscribe: channels, category, productId }));
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  /**
   * Register a handler that fires on every successful reconnect (not the first
   * connect). Returns an unsubscribe fn. When at least one handler is
   * registered, the default window.location.reload() is suppressed — the
   * handler is expected to invalidate caches and rehydrate server state.
   */
  onReconnect(handler: () => void) {
    this.reconnectHandlers.add(handler);
    return () => { this.reconnectHandlers.delete(handler); };
  }

  getConnectionSnapshot(): WsConnectionSnapshot {
    return this.connectionSnapshot;
  }

  onConnectionChange(handler: ConnectionHandler) {
    this.connectionHandlers.add(handler);
    return () => { this.connectionHandlers.delete(handler); };
  }

  close() {
    this.closed = true;
    this.clearIdleTimer();
    this.ws?.close();
    this.ws = null;
    this.updateConnectionStatus('offline', {
      nextReconnectDelayMs: null,
      lastDisconnectedAt: new Date().toISOString(),
    });
  }
}

export const wsManager = new WsManager();
