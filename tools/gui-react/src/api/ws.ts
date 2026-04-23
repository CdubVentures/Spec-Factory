type Channel = 'events' | 'process' | 'process-status' | 'data-change' | 'test-import-progress' | 'test-run-progress' | 'test-repair-progress' | 'indexlab-event' | 'operations' | 'llm-stream' | 'heartbeat';
type MessageHandler = (channel: Channel, data: unknown) => void;

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

export class WsManager {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectMs: number;
  private maxReconnectMs: number;
  private currentDelay: number;
  private handlers = new Set<MessageHandler>();
  private reconnectHandlers = new Set<() => void>();
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
    this.ws = new this.webSocketClass(this.url);

    this.ws.onopen = () => {
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
      try {
        const msg = JSON.parse(evt.data);
        const channel = msg.channel as Channel;
        this.handlers.forEach((h) => h(channel, msg.data));
      } catch { /* ignore bad frames */ }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.clearIdleTimer();
      if (!this.closed) {
        setTimeout(() => this.connect(), this.currentDelay);
        this.currentDelay = Math.min(this.currentDelay * 1.5, this.maxReconnectMs);
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

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

  close() {
    this.closed = true;
    this.clearIdleTimer();
    this.ws?.close();
    this.ws = null;
  }
}

export const wsManager = new WsManager();
