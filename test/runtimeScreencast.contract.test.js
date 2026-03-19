import test from 'node:test';
import assert from 'node:assert/strict';

import { attachRuntimeScreencast } from '../src/fetcher/runtimeScreencast.js';

function installManualTimeouts() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const pending = [];

  global.setTimeout = (callback, delay, ...args) => {
    const handle = {
      callback,
      delay: Number(delay),
      args,
      cleared: false,
      fired: false,
    };
    pending.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    if (handle && typeof handle === 'object') {
      handle.cleared = true;
    }
  };

  return {
    pending,
    flushNext() {
      const next = pending.find((handle) => !handle.cleared && !handle.fired);
      if (!next) return false;
      next.fired = true;
      next.callback(...next.args);
      return true;
    },
    flushAll() {
      while (this.flushNext()) {
        // keep draining pending timers
      }
    },
    restore() {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    },
  };
}

async function resolvesBeforeNextTurn(promise) {
  return Promise.race([
    promise.then(() => 'resolved'),
    new Promise((resolve) => setImmediate(() => resolve('pending'))),
  ]);
}

function createPage({
  screenshotBytes = Buffer.from('fallback-frame', 'utf8'),
  viewport = { width: 640, height: 480 },
  cdpSessionFactory = null,
} = {}) {
  const cdpSession = cdpSessionFactory ? cdpSessionFactory() : {
    async send() {},
    on() {},
    async detach() {},
  };
  return {
    context() {
      return {
        newCDPSession: async () => cdpSession,
      };
    },
    async screenshot() {
      return screenshotBytes;
    },
    viewportSize() {
      return viewport;
    },
    _cdpSession: cdpSession,
  };
}

test('attachRuntimeScreencast forwards CDP screencast frames when available', async () => {
  const timers = installManualTimeouts();
  const frames = [];
  let frameHandler = null;
  const page = createPage({
    cdpSessionFactory: () => ({
      async send() {},
      on(event, handler) {
        if (event === 'Page.screencastFrame') {
          frameHandler = handler;
        }
      },
      async detach() {},
    }),
  });

  const stop = await attachRuntimeScreencast({
    page,
    config: { runtimeScreencastEnabled: true, runtimeScreencastFps: 10 },
    workerId: 'fetch-1',
    onFrame: (frame) => frames.push(frame),
  });

  let stopPromise = null;
  try {
    await frameHandler({
      sessionId: 1,
      data: 'cdp-frame-data',
      metadata: {
        deviceWidth: 1280,
        deviceHeight: 720,
      },
    });

    stopPromise = stop();
    assert.equal(await resolvesBeforeNextTurn(stopPromise), 'resolved');
    await stopPromise;

    assert.equal(frames.length, 1);
    assert.equal(frames[0].worker_id, 'fetch-1');
    assert.equal(frames[0].data, 'cdp-frame-data');
    assert.equal(frames[0].width, 1280);
    assert.equal(frames[0].height, 720);
  } finally {
    timers.flushAll();
    await stopPromise?.catch(() => {});
    timers.restore();
  }
});

test('attachRuntimeScreencast falls back to screenshots when CDP stays silent', async () => {
  const timers = installManualTimeouts();
  const frames = [];
  const screenshotBytes = Buffer.from('silent-fallback-frame', 'utf8');
  const page = createPage({
    screenshotBytes,
    viewport: { width: 800, height: 600 },
  });

  const stop = await attachRuntimeScreencast({
    page,
    config: { runtimeScreencastEnabled: true, runtimeScreencastFps: 10 },
    workerId: 'fetch-2',
    onFrame: (frame) => frames.push(frame),
  });

  let stopPromise = null;
  try {
    assert.equal(timers.flushNext(), true, 'fallback timer should be scheduled');
    await Promise.resolve();
    stopPromise = stop();
    assert.equal(await resolvesBeforeNextTurn(stopPromise), 'resolved');
    await stopPromise;

    assert.ok(frames.length >= 1);
    assert.equal(frames[0].worker_id, 'fetch-2');
    assert.equal(frames[0].data, screenshotBytes.toString('base64'));
    assert.equal(frames[0].width, 800);
    assert.equal(frames[0].height, 600);
  } finally {
    timers.flushAll();
    await stopPromise?.catch(() => {});
    timers.restore();
  }
});

test('attachRuntimeScreencast emits a final screenshot when stopped before the first interval tick', async () => {
  const timers = installManualTimeouts();
  const frames = [];
  const screenshotBytes = Buffer.from('final-short-lived-frame', 'utf8');
  const page = createPage({
    screenshotBytes,
    viewport: { width: 1024, height: 768 },
  });

  const stop = await attachRuntimeScreencast({
    page,
    config: { runtimeScreencastEnabled: true, runtimeScreencastFps: 10 },
    workerId: 'fetch-3',
    onFrame: (frame) => frames.push(frame),
  });

  let stopPromise = null;
  try {
    stopPromise = stop();
    assert.equal(await resolvesBeforeNextTurn(stopPromise), 'resolved');
    await stopPromise;

    assert.equal(frames.length, 1);
    assert.equal(frames[0].worker_id, 'fetch-3');
    assert.equal(frames[0].data, screenshotBytes.toString('base64'));
    assert.equal(frames[0].width, 1024);
    assert.equal(frames[0].height, 768);
  } finally {
    timers.flushAll();
    await stopPromise?.catch(() => {});
    timers.restore();
  }
});
