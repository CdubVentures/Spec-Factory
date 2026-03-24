import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  createGuiStaticFileServer,
  resolveStaticMimeType,
} from '../staticFileServer.js';

function createFakeStream(label) {
  const handlers = new Map();
  const pipes = [];

  return {
    label,
    on(eventName, handler) {
      handlers.set(eventName, handler);
      return this;
    },
    pipe(target) {
      pipes.push(target);
      return target;
    },
    emitError(error = new Error(`stream_error:${label}`)) {
      const handler = handlers.get('error');
      if (typeof handler === 'function') {
        handler(error);
      }
    },
    get pipeCount() {
      return pipes.length;
    },
  };
}

function createFakeResponse() {
  const headers = new Map();
  let endPayload = null;
  return {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(name, value);
    },
    end(payload) {
      endPayload = payload;
    },
    getHeader(name) {
      return headers.get(name);
    },
    get endPayload() {
      return endPayload;
    },
  };
}

test('static file server serves requested file with mime + no-cache headers', () => {
  const readCalls = [];
  const stream = createFakeStream('primary');
  const serveStatic = createGuiStaticFileServer({
    distRoot: '/tmp/dist',
    pathModule: path,
    createReadStream: (filePath) => {
      readCalls.push(filePath);
      return stream;
    },
  });

  const res = createFakeResponse();
  serveStatic({ url: '/assets/main.js' }, res);

  assert.equal(readCalls.length, 1);
  assert.equal(readCalls[0], path.join('/tmp/dist', '/assets/main.js'));
  assert.equal(res.getHeader('Content-Type'), 'application/javascript');
  assert.equal(res.getHeader('Cache-Control'), 'no-cache, no-store, must-revalidate');
  assert.equal(res.getHeader('Pragma'), 'no-cache');
  assert.equal(res.getHeader('Expires'), '0');
  assert.equal(stream.pipeCount, 1);
});

test('static file server maps extensionless routes to index.html', () => {
  const readCalls = [];
  const stream = createFakeStream('primary');
  const serveStatic = createGuiStaticFileServer({
    distRoot: '/tmp/dist',
    pathModule: path,
    createReadStream: (filePath) => {
      readCalls.push(filePath);
      return stream;
    },
  });

  const res = createFakeResponse();
  serveStatic({ url: '/runtime-ops' }, res);

  assert.equal(readCalls.length, 1);
  assert.equal(readCalls[0], path.join('/tmp/dist', 'index.html'));
  assert.equal(res.getHeader('Content-Type'), 'text/html');
});

test('static file server falls back to index.html when primary stream fails', () => {
  const readCalls = [];
  const streams = [createFakeStream('primary'), createFakeStream('fallback')];
  const serveStatic = createGuiStaticFileServer({
    distRoot: '/tmp/dist',
    pathModule: path,
    createReadStream: (filePath) => {
      readCalls.push(filePath);
      return streams[readCalls.length - 1];
    },
  });

  const res = createFakeResponse();
  serveStatic({ url: '/assets/missing.js' }, res);
  streams[0].emitError();

  assert.equal(readCalls.length, 2);
  assert.equal(readCalls[1], path.join('/tmp/dist', 'index.html'));
  assert.equal(res.getHeader('Content-Type'), 'text/html');
  assert.equal(streams[1].pipeCount, 1);
});

test('static file server returns 404 when primary and fallback streams fail', () => {
  const createdStreams = [];
  const streamQueue = [createFakeStream('primary'), createFakeStream('fallback')];
  const serveStatic = createGuiStaticFileServer({
    distRoot: '/tmp/dist',
    pathModule: path,
    createReadStream: () => {
      const stream = streamQueue.shift();
      createdStreams.push(stream);
      return stream;
    },
  });

  const res = createFakeResponse();
  serveStatic({ url: '/assets/missing.js' }, res);

  const primary = createdStreams[0];
  primary.emitError();
  const fallback = createdStreams[1];
  fallback.emitError();

  assert.equal(res.statusCode, 404);
  assert.equal(res.endPayload, 'Not Found');
});

test('resolveStaticMimeType maps known extensions and falls back to octet-stream', () => {
  assert.equal(resolveStaticMimeType('.css'), 'text/css');
  assert.equal(resolveStaticMimeType('.png'), 'image/png');
  assert.equal(resolveStaticMimeType('.unknown-ext'), 'application/octet-stream');
});
