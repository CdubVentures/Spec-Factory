import test from 'node:test';
import assert from 'node:assert/strict';

import { attachRuntimeScreencast } from '../src/fetcher/runtimeScreencast.js';

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

  await frameHandler({
    sessionId: 1,
    data: 'cdp-frame-data',
    metadata: {
      deviceWidth: 1280,
      deviceHeight: 720,
    },
  });
  await stop();

  assert.equal(frames.length, 1);
  assert.equal(frames[0].worker_id, 'fetch-1');
  assert.equal(frames[0].data, 'cdp-frame-data');
  assert.equal(frames[0].width, 1280);
  assert.equal(frames[0].height, 720);
});

test('attachRuntimeScreencast falls back to screenshots when CDP stays silent', async () => {
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

  await new Promise((resolve) => setTimeout(resolve, 275));
  await stop();

  assert.ok(frames.length >= 1);
  assert.equal(frames[0].worker_id, 'fetch-2');
  assert.equal(frames[0].data, screenshotBytes.toString('base64'));
  assert.equal(frames[0].width, 800);
  assert.equal(frames[0].height, 600);
});

test('attachRuntimeScreencast emits a final screenshot when stopped before the first interval tick', async () => {
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

  await stop();

  assert.equal(frames.length, 1);
  assert.equal(frames[0].worker_id, 'fetch-3');
  assert.equal(frames[0].data, screenshotBytes.toString('base64'));
  assert.equal(frames[0].width, 1024);
  assert.equal(frames[0].height, 768);
});
