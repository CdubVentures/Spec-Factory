import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';

class CaptureResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = new Map();
    this.chunks = [];
    this.endCallCount = 0;
    this.json = null;
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  setHeader(name, value) {
    this.headers.set(name, value);
  }

  getHeader(name) {
    return this.headers.get(name);
  }

  end(chunk, encoding, callback) {
    this.endCallCount += 1;
    return super.end(chunk, encoding, callback);
  }

  get body() {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

export function createCaptureResponse() {
  return new CaptureResponse();
}

export function createFakeFs(initialFiles = {}) {
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
          const slice = payload.subarray(position, position + length);
          slice.copy(buffer, offset);
          return { bytesRead: slice.length, buffer };
        },
        async close() {},
      };
    },
  };
}

export function createWatchHarness() {
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

export function createWebSocketHarness() {
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

export async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

export function parseNdjson(raw) {
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

export function createWsSubscription(overrides = {}) {
  return {
    subscribe: ['events'],
    category: 'mouse',
    productId: 'mouse-razer-viper',
    ...overrides,
  };
}

export function createRuntimeEvent(overrides = {}) {
  return {
    category: 'mouse',
    productId: 'mouse-razer-viper',
    stage: 'ok',
    ...overrides,
  };
}

export function createIndexLabEvent(overrides = {}) {
  return {
    category: 'mouse',
    product_id: 'mouse-razer-viper',
    event: 'parse_done',
    ...overrides,
  };
}

export function createScreencastFrame(overrides = {}) {
  return {
    __screencast: true,
    channel: 'screencast-fetch-9',
    worker_id: 'fetch-9',
    data: 'abc123',
    width: 1280,
    height: 720,
    ts: '2026-03-08T08:10:00.000Z',
    ...overrides,
  };
}

export function createFakeChild(pid = 3210) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.sentMessages = [];
  child.send = (message) => {
    child.sentMessages.push(message);
  };
  child.killSignals = [];
  child.kill = (signal = 'SIGTERM') => {
    child.killSignals.push(signal);
    if (child.exitCode === null) {
      child.exitCode = signal === 'SIGKILL' ? 137 : 0;
      child.emit('exit', child.exitCode, signal);
    }
  };
  return child;
}

export function createCommandChild({ stdout = '', stderr = '', exitCode = 0 } = {}) {
  const child = new EventEmitter();
  child.pid = 0;
  child.exitCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  queueMicrotask(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.exitCode = exitCode;
    child.emit('exit', exitCode, null);
  });
  return child;
}

export function createCatalogProduct(overrides = {}) {
  return {
    brand: 'Acme',
    model: 'Orbit X1',
    base_model: 'Orbit X1',
    variant: '',
    id: 10,
    ...overrides,
  };
}

export function createCatalogInput(overrides = {}) {
  const identityLock = {
    brand: 'Acme',
    base_model: 'Orbit X1',
    model: 'Orbit X1',
    variant: '',
    ...(overrides.identityLock || {}),
  };

  return {
    productId: 'mouse-acme-orbit-x1',
    identityLock,
    active: true,
    ...overrides,
    identityLock,
  };
}

export function createCatalogSummary(overrides = {}) {
  return {
    validated: true,
    confidence: 0.86,
    coverage_overall_percent: 77,
    fields_filled: 7,
    fields_total: 9,
    generated_at: '2026-02-26T10:00:00.000Z',
    ...overrides,
  };
}

export function createNormalizedIdentity(overrides = {}) {
  return {
    identity: {
      brand: 'Acme',
      base_model: 'Orbit X1',
      model: 'Orbit X1 Core',
      variant: 'Core',
      ...overrides,
    },
  };
}

export function createCompiledComponentRecord(overrides = {}) {
  const { properties = {}, ...rest } = overrides;
  return {
    name: 'PixArt PMW',
    maker: 'OldMaker',
    links: [],
    aliases: [],
    properties: {
      dpi: 1000,
      ...properties,
    },
    ...rest,
  };
}
