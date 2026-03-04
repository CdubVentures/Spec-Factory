import { WebSocketServer } from 'ws';
import { watch as watchFiles } from 'chokidar';

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
  watchFactory = watchFiles,
  webSocketServerClass = WebSocketServer,
  now = () => new Date(),
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
  assertFunction('watchFactory', watchFactory);
  assertFunction('webSocketServerClass', webSocketServerClass);
  assertFunction('now', now);

  const wsClients = new Set();
  let wsServer = null;
  let watchers = null;

  function broadcastWs(channel, data) {
    const timestamp = now().toISOString();
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

    return wsServer;
  }

  function setupWatchers() {
    if (watchers) return watchers;

    const eventsPath = path.join(outputRoot, '_runtime', 'events.jsonl');
    let lastEventSize = 0;
    const indexlabOffsets = new Map();

    const eventsWatcher = watchFactory(eventsPath, { persistent: true, ignoreInitial: true });
    eventsWatcher.on('change', async () => {
      try {
        const stat = await fs.stat(eventsPath);
        if (stat.size <= lastEventSize) {
          lastEventSize = stat.size;
          return;
        }
        const fd = await fs.open(eventsPath, 'r');
        const buf = Buffer.alloc(stat.size - lastEventSize);
        await fd.read(buf, 0, buf.length, lastEventSize);
        await fd.close();
        lastEventSize = stat.size;
        const newLines = buf.toString('utf8').split('\n').filter(Boolean);
        const events = newLines
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        if (events.length > 0) {
          broadcastWs('events', events);
        }
      } catch {
        // ignore watcher errors
      }
    });

    const indexlabPattern = path.join(indexLabRoot, '*', 'run_events.ndjson');
    const indexlabWatcher = watchFactory(indexlabPattern, { persistent: true, ignoreInitial: true });

    const publishIndexLabDelta = async (filePath) => {
      try {
        const stat = await fs.stat(filePath);
        const key = path.resolve(filePath);
        const previousSize = indexlabOffsets.get(key) || 0;
        if (stat.size < previousSize) {
          indexlabOffsets.set(key, 0);
        }
        const start = Math.max(0, Math.min(previousSize, stat.size));
        if (stat.size <= start) {
          indexlabOffsets.set(key, stat.size);
          return;
        }
        const fd = await fs.open(filePath, 'r');
        const buf = Buffer.alloc(stat.size - start);
        await fd.read(buf, 0, buf.length, start);
        await fd.close();
        indexlabOffsets.set(key, stat.size);
        const rows = parseNdjson(buf.toString('utf8'));
        if (rows.length > 0) {
          broadcastWs('indexlab-event', rows);
        }
      } catch {
        // ignore watcher errors
      }
    };

    indexlabWatcher.on('add', publishIndexLabDelta);
    indexlabWatcher.on('change', publishIndexLabDelta);

    watchers = { eventsWatcher, indexlabWatcher };
    return watchers;
  }

  return {
    broadcastWs,
    setupWatchers,
    attachWebSocketUpgrade,
  };
}
