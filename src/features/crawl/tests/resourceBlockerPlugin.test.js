import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resourceBlockerPlugin } from '../plugins/resourceBlockerPlugin.js';

function makeRoute() {
  const calls = [];
  return {
    calls,
    abort: () => { calls.push('abort'); },
    fallback: () => { calls.push('fallback'); },
    continue: () => { calls.push('continue'); },
  };
}

function makeRequest({ url = 'https://example.com/thing', resourceType = 'document' } = {}) {
  return {
    url: () => url,
    resourceType: () => resourceType,
  };
}

async function runHandler(settings, request) {
  let registeredHandler = null;
  const page = {
    route: async (_pattern, handler) => { registeredHandler = handler; },
  };
  await resourceBlockerPlugin.hooks.onInit({ page, settings });
  assert.ok(registeredHandler, 'expected onInit to register a route handler');
  const route = makeRoute();
  await registeredHandler(route, request);
  return route;
}

describe('resourceBlockerPlugin', () => {
  it('has correct plugin shape', () => {
    assert.equal(resourceBlockerPlugin.name, 'resourceBlocker');
    assert.equal(typeof resourceBlockerPlugin.hooks.onInit, 'function');
  });

  it('does not register route when resourceBlockingEnabled is false', async () => {
    let registered = false;
    const page = { route: async () => { registered = true; } };
    await resourceBlockerPlugin.hooks.onInit({ page, settings: { resourceBlockingEnabled: false } });
    assert.equal(registered, false);
  });

  it('does not register route when resourceBlockingEnabled is undefined (default off)', async () => {
    let registered = false;
    const page = { route: async () => { registered = true; } };
    await resourceBlockerPlugin.hooks.onInit({ page, settings: {} });
    assert.equal(registered, false);
  });

  it('registers route when resourceBlockingEnabled is true', async () => {
    let registered = false;
    const page = { route: async () => { registered = true; } };
    await resourceBlockerPlugin.hooks.onInit({ page, settings: { resourceBlockingEnabled: true } });
    assert.equal(registered, true);
  });

  it('blocks image requests', async () => {
    const route = await runHandler(
      { resourceBlockingEnabled: true },
      makeRequest({ resourceType: 'image', url: 'https://example.com/hero.jpg' }),
    );
    assert.deepEqual(route.calls, ['abort']);
  });

  it('blocks font requests', async () => {
    const route = await runHandler(
      { resourceBlockingEnabled: true },
      makeRequest({ resourceType: 'font', url: 'https://example.com/inter.woff2' }),
    );
    assert.deepEqual(route.calls, ['abort']);
  });

  it('blocks media requests', async () => {
    const route = await runHandler(
      { resourceBlockingEnabled: true },
      makeRequest({ resourceType: 'media', url: 'https://example.com/video.mp4' }),
    );
    assert.deepEqual(route.calls, ['abort']);
  });

  it('blocks texttrack requests', async () => {
    const route = await runHandler(
      { resourceBlockingEnabled: true },
      makeRequest({ resourceType: 'texttrack', url: 'https://example.com/subs.vtt' }),
    );
    assert.deepEqual(route.calls, ['abort']);
  });

  it('blocks known tracker domains regardless of resource type', async () => {
    const trackerHosts = [
      'https://www.google-analytics.com/collect',
      'https://www.googletagmanager.com/gtm.js',
      'https://connect.facebook.net/en_US/fbevents.js',
      'https://stats.g.doubleclick.net/j/collect',
      'https://static.hotjar.com/c/hotjar.js',
    ];
    for (const url of trackerHosts) {
      const route = await runHandler(
        { resourceBlockingEnabled: true },
        makeRequest({ resourceType: 'script', url }),
      );
      assert.deepEqual(route.calls, ['abort'], `expected ${url} to be aborted`);
    }
  });

  it('falls back (not blocks) document requests', async () => {
    const route = await runHandler(
      { resourceBlockingEnabled: true },
      makeRequest({ resourceType: 'document', url: 'https://example.com/product' }),
    );
    assert.deepEqual(route.calls, ['fallback']);
  });

  it('falls back stylesheet requests (extraction needs CSS)', async () => {
    const route = await runHandler(
      { resourceBlockingEnabled: true },
      makeRequest({ resourceType: 'stylesheet', url: 'https://example.com/main.css' }),
    );
    assert.deepEqual(route.calls, ['fallback']);
  });

  it('falls back script requests (SPAs need JS)', async () => {
    const route = await runHandler(
      { resourceBlockingEnabled: true },
      makeRequest({ resourceType: 'script', url: 'https://example.com/app.js' }),
    );
    assert.deepEqual(route.calls, ['fallback']);
  });

  it('falls back xhr requests (product data lives in APIs)', async () => {
    const route = await runHandler(
      { resourceBlockingEnabled: true },
      makeRequest({ resourceType: 'xhr', url: 'https://api.example.com/products/123' }),
    );
    assert.deepEqual(route.calls, ['fallback']);
  });

  it('falls back fetch requests', async () => {
    const route = await runHandler(
      { resourceBlockingEnabled: true },
      makeRequest({ resourceType: 'fetch', url: 'https://api.example.com/specs' }),
    );
    assert.deepEqual(route.calls, ['fallback']);
  });

  it('does not match partial tracker-domain substrings (exact host boundary)', async () => {
    // "analytics" substring should NOT match "google-analytics.com" on a legit site
    const route = await runHandler(
      { resourceBlockingEnabled: true },
      makeRequest({ resourceType: 'script', url: 'https://analytics-dashboard.company.com/app.js' }),
    );
    assert.deepEqual(route.calls, ['fallback']);
  });
});
