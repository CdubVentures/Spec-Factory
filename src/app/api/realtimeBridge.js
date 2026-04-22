import { WebSocketServer } from 'ws';

function assertFunction(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
}

function assertObject(name, value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertString(name, value) {
  if (!String(value || '').trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function wsToken(value) {
  return String(value || '').trim().toLowerCase();
}

function wsEventProductId(evt) {
  return String(evt?.productId || evt?.product_id || '').trim();
}

function wsEventMatchesCategory(evt, categoryToken) {
  if (!categoryToken) return true;
  const evtCategory = wsToken(evt?.category || evt?.cat || '');
  if (evtCategory) return evtCategory === categoryToken;
  const pid = wsToken(wsEventProductId(evt));
  return pid.startsWith(`${categoryToken}-`);
}

function wsClientWantsChannel(client, channel) {
  const channels = Array.isArray(client?._channels) ? client._channels : [];
  if (channels.length === 0) return true;
  return channels.includes(channel);
}

function wsFilterPayload(channel, data, client, dataChangeMatchesCategory) {
  if (channel === 'events' && Array.isArray(data)) {
    const categoryToken = wsToken(client?._category);
    const productId = String(client?._productId || '').trim();
    let rows = data;
    if (categoryToken) {
      rows = rows.filter((evt) => wsEventMatchesCategory(evt, categoryToken));
    }
    if (productId) {
      rows = rows.filter((evt) => wsEventProductId(evt) === productId);
    }
    return rows.length > 0 ? rows : null;
  }
  if (channel === 'indexlab-event' && Array.isArray(data)) {
    const categoryToken = wsToken(client?._category);
    const productId = String(client?._productId || '').trim();
    let rows = data;
    if (categoryToken) {
      rows = rows.filter((evt) => wsToken(evt?.category || '') === categoryToken);
    }
    if (productId) {
      rows = rows.filter((evt) => String(evt?.product_id || '').trim() === productId);
    }
    return rows.length > 0 ? rows : null;
  }
  if (channel === 'data-change' && data && typeof data === 'object') {
    const categoryToken = wsToken(client?._category);
    if (!dataChangeMatchesCategory(data, categoryToken)) {
      return null;
    }
  }
  return data;
}

export function createRealtimeBridge({
  path,
  fs,
  outputRoot,
  indexLabRoot,
  parseNdjson,
  dataChangeMatchesCategory,
  processStatus,
  forwardScreencastControl,
  webSocketServerClass = WebSocketServer,
  now = () => new Date(),
  // WHY: WS half-open detection. Without heartbeat, a silently-dropped TCP
  // connection leaves client.readyState=OPEN while broadcasts vanish. Server
  // pings every heartbeatMs; clients that miss one round (tick with no pong)
  // are terminate()d so the client's onclose → reconnect path fires.
  // Default 0 (off) keeps existing unit tests timer-free; production wiring
  // in serverBootstrap passes a real value.
  heartbeatMs = 0,
} = {}) {
  assertObject('path', path);
  assertFunction('path.join', path.join?.bind(path));
  assertFunction('path.resolve', path.resolve?.bind(path));
  assertObject('fs', fs);
  assertFunction('fs.stat', fs.stat?.bind(fs));
  assertFunction('fs.open', fs.open?.bind(fs));
  assertString('outputRoot', outputRoot);
  assertString('indexLabRoot', indexLabRoot);
  assertFunction('parseNdjson', parseNdjson);
  assertFunction('dataChangeMatchesCategory', dataChangeMatchesCategory);
  assertFunction('processStatus', processStatus);
  assertFunction('forwardScreencastControl', forwardScreencastControl);
  assertFunction('webSocketServerClass', webSocketServerClass);
  assertFunction('now', now);

  const wsClients = new Set();
  let wsServer = null;
  // WHY: Chokidar watchers removed — NDJSON event files no longer written (SQL migration Steps 3+5)
  const lastScreencastFrames = new Map();

  function screencastCacheKey(runId, workerId) {
    const normalizedRunId = String(runId || '').trim();
    const normalizedWorkerId = String(workerId || '').trim();
    if (!normalizedRunId || !normalizedWorkerId) return '';
    return `${normalizedRunId}::${normalizedWorkerId}`;
  }

  function broadcastWs(channel, data) {
    const timestamp = now().toISOString();
    if (
      String(channel || '').startsWith('screencast-')
      && data
      && typeof data === 'object'
      && !Array.isArray(data)
    ) {
      const workerId = String(data.worker_id || '').trim();
      const frameData = typeof data.data === 'string' ? data.data : '';
      const status = processStatus();
      const runId = String(data.run_id || status?.run_id || status?.runId || '').trim();
      const cacheKey = screencastCacheKey(runId, workerId);
      if (cacheKey && frameData) {
        lastScreencastFrames.set(cacheKey, {
          run_id: runId,
          worker_id: workerId,
          data: frameData,
          width: Number(data.width || 0),
          height: Number(data.height || 0),
          ts: String(data.ts || timestamp),
        });
      }
    }
    for (const client of wsClients) {
      if (client.readyState !== 1) continue; // OPEN
      if (!wsClientWantsChannel(client, channel)) continue;
      const filtered = wsFilterPayload(channel, data, client, dataChangeMatchesCategory);
      if (filtered === null || filtered === undefined) continue;
      try {
        client.send(JSON.stringify({ channel, data: filtered, ts: timestamp }));
      } catch {
        // ignore broken sockets
      }
    }
  }

  function emitProcessStatus(ws) {
    try {
      ws.send(JSON.stringify({
        channel: 'process-status',
        data: processStatus(),
        ts: now().toISOString(),
      }));
    } catch {
      // ignore socket send failure
    }
  }

  function bindClient(ws) {
    wsClients.add(ws);
    // WHY: Heartbeat state. Fresh clients are alive; pong resets the flag after
    // each ping. tickHeartbeat terminates any client still flagged not-alive.
    ws._isAlive = true;
    ws.on('pong', () => { ws._isAlive = true; });
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.subscribe) {
          ws._channels = data.subscribe;
          if (Array.isArray(data.subscribe) && data.subscribe.includes('process-status')) {
            emitProcessStatus(ws);
          }
        }
        if (data.category) ws._category = data.category;
        if (data.productId) ws._productId = data.productId;
        if (data.screencast_subscribe) {
          try {
            forwardScreencastControl({ subscribeWorkerId: data.screencast_subscribe });
          } catch {
            // ignore forwarding failures
          }
        }
        if (data.screencast_unsubscribe) {
          try {
            forwardScreencastControl({ unsubscribe: true });
          } catch {
            // ignore forwarding failures
          }
        }
      } catch {
        // ignore malformed messages
      }
    });
    ws.on('close', () => wsClients.delete(ws));
    ws.on('error', () => wsClients.delete(ws));
  }

  let heartbeatTimer = null;

  function tickHeartbeat() {
    for (const client of wsClients) {
      if (client.readyState !== 1) continue;
      if (client._isAlive === false) {
        // WHY: No pong between the last tick and this one → half-open. terminate()
        // is abrupt by design; graceful close() can block on a dead socket.
        try { client.terminate(); } catch { /* ignore */ }
        continue;
      }
      client._isAlive = false;
      try { client.ping(); } catch { /* ignore broken sockets */ }
    }
    // WHY: App-level heartbeat broadcast gives the client a reliable "server is
    // alive" signal regardless of whether any pipeline is broadcasting. The
    // client's idle watchdog resets on every onmessage; without this, a truly
    // idle server would trip false-positive reloads every idle window.
    broadcastWs('heartbeat', { ts: now().toISOString() });
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function attachWebSocketUpgrade(server) {
    if (!server || typeof server.on !== 'function') {
      throw new TypeError('server.on must be a function');
    }
    if (wsServer) return wsServer;

    wsServer = new webSocketServerClass({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      if (req.url === '/ws' || req.url?.startsWith('/ws?')) {
        wsServer.handleUpgrade(req, socket, head, (ws) => {
          bindClient(ws);
        });
      } else {
        socket.destroy();
      }
    });

    if (heartbeatMs > 0 && !heartbeatTimer) {
      heartbeatTimer = setInterval(tickHeartbeat, heartbeatMs);
      // WHY: Don't hold the event loop open just for the heartbeat — graceful
      // shutdowns (and tests that forget stopHeartbeat) should still exit.
      if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
    }

    return wsServer;
  }

  function setupWatchers() {
    return null;
  }

  function getLastScreencastFrame(runId, workerId) {
    const cacheKey = screencastCacheKey(runId, workerId);
    if (!cacheKey) return null;
    return lastScreencastFrames.get(cacheKey) || null;
  }

  return {
    broadcastWs,
    setupWatchers,
    attachWebSocketUpgrade,
    getLastScreencastFrame,
    tickHeartbeat,
    stopHeartbeat,
  };
}
