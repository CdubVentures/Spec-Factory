import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrawlSession } from '../crawlSession.js';

// Substantial HTML > 5KB — classified as not-blocked by bypassStrategies
const UNLOCKED_HTML = '<html><head><title>Unlocked</title></head><body>' + 'x'.repeat(6000) + '</body></html>';

/**
 * Crawler factory where each URL routes to either success / blocked / robots-blocked.
 * Blocked URLs go through failedRequestHandler with __blockInfo — mimics the production
 * flow where requestHandler throws `blocked:*` and the handler rescues via userData.
 */
function makeRouterFactory(routes) {
  return (_config) => ({
    async run(requests = []) {
      for (const request of requests) {
        const route = routes[request.url];
        if (!route) continue;

        if (route.kind === 'blocked' || route.kind === 'robots') {
          const blockReason = route.kind === 'robots' ? 'robots_blocked' : (route.blockReason || 'status_403');
          const status = route.status ?? (route.kind === 'robots' ? 451 : 403);
          await _config.failedRequestHandler(
            {
              request: {
                url: request.url,
                uniqueKey: request.uniqueKey,
                userData: {
                  __blockInfo: { blocked: true, blockReason, status, html: route.html || '', title: '', finalUrl: request.url },
                },
                retryCount: 1,
                noRetry: true,
              },
            },
            new Error(`blocked:${blockReason}`),
          );
          continue;
        }

        const page = {
          async addInitScript() {}, async addStyleTag() {}, async route() {},
          async evaluate() { return 0; }, async waitForTimeout() {},
          async content() { return route.html ?? UNLOCKED_HTML; },
          async title() { return route.title ?? 'OK'; },
          url() { return request.url; },
          viewportSize() { return { width: 1920, height: 1080 }; },
          async screenshot() { return Buffer.from('shot'); },
          async $() { return null; },
          video() { return null; },
          mouse: { async wheel() {} },
        };
        await _config.requestHandler({
          page,
          request: { url: request.url, uniqueKey: request.uniqueKey, userData: {} },
          response: { status: () => route.status ?? 200, headers: () => ({}) },
        });
      }
    },
    async teardown() {},
  });
}

function makeUnlockerSpy(returnFor) {
  const calls = [];
  const fn = async ({ url, apiKey, zone, timeoutMs, maxRetries }) => {
    calls.push({ url, apiKey, zone, timeoutMs, maxRetries });
    return returnFor(url);
  };
  fn.calls = calls;
  return fn;
}

async function runSingleUrlFetchPlan(session, url) {
  await session.start();
  return await session.runFetchPlan({
    orderedSources: [{ url }],
    workerIdMap: new Map(),
  });
}

describe('crawlSession — Bright Data unlocker fallback', () => {
  it('feature disabled → unlocker not called even on blocked URL', async () => {
    const factory = makeRouterFactory({ 'http://blocked.example.com': { kind: 'blocked' } });
    const unlocker = makeUnlockerSpy(() => ({ status: 200, html: UNLOCKED_HTML, finalUrl: '', title: '', error: '', attemptsUsed: 1 }));

    const session = createCrawlSession({
      settings: {
        brightDataUnlockerEnabled: false,
        brightDataApiKey: 'KEY',
        brightDataZone: 'web_unlocker1',
        crawleeProxyRetryEnabled: false,
      },
      plugins: [],
      _crawlerFactory: factory,
      _brightDataUnlocker: unlocker,
    });

    const { crawlResults } = await runSingleUrlFetchPlan(session, 'http://blocked.example.com');
    assert.equal(unlocker.calls.length, 0, 'disabled flag must skip the path entirely');
    assert.equal(crawlResults[0].blocked, true);
  });

  it('enabled but API key empty → unlocker not called (graceful skip)', async () => {
    const factory = makeRouterFactory({ 'http://blocked.example.com': { kind: 'blocked' } });
    const unlocker = makeUnlockerSpy(() => ({ status: 200, html: UNLOCKED_HTML, finalUrl: '', title: '', error: '', attemptsUsed: 1 }));

    const session = createCrawlSession({
      settings: {
        brightDataUnlockerEnabled: true,
        brightDataApiKey: '',
        brightDataZone: 'web_unlocker1',
        crawleeProxyRetryEnabled: false,
      },
      plugins: [],
      _crawlerFactory: factory,
      _brightDataUnlocker: unlocker,
    });

    await runSingleUrlFetchPlan(session, 'http://blocked.example.com');
    assert.equal(unlocker.calls.length, 0, 'no API key → skip, do not throw');
  });

  it('enabled + key + blocked URL → unlocker called; result merged with brightDataUnlocked:true', async () => {
    const factory = makeRouterFactory({ 'http://blocked.example.com': { kind: 'blocked' } });
    const unlocker = makeUnlockerSpy((url) => ({
      status: 200,
      html: UNLOCKED_HTML,
      finalUrl: url,
      title: 'Unlocked',
      error: '',
      attemptsUsed: 1,
    }));

    const session = createCrawlSession({
      settings: {
        brightDataUnlockerEnabled: true,
        brightDataApiKey: 'KEY_123',
        brightDataZone: 'web_unlocker1',
        brightDataTimeoutMs: 30000,
        brightDataMaxRetries: 2,
        crawleeProxyRetryEnabled: false,
      },
      plugins: [],
      _crawlerFactory: factory,
      _brightDataUnlocker: unlocker,
    });

    const { crawlResults } = await runSingleUrlFetchPlan(session, 'http://blocked.example.com');
    assert.equal(unlocker.calls.length, 1, 'should call unlocker once on the blocked URL');
    assert.equal(unlocker.calls[0].url, 'http://blocked.example.com');
    assert.equal(unlocker.calls[0].apiKey, 'KEY_123');
    assert.equal(unlocker.calls[0].zone, 'web_unlocker1');
    assert.equal(unlocker.calls[0].timeoutMs, 30000);
    assert.equal(unlocker.calls[0].maxRetries, 2);

    const result = crawlResults[0];
    assert.equal(result.blocked, false, 'substantial html from unlocker should clear blocked flag');
    assert.equal(result.status, 200);
    assert.equal(result.title, 'Unlocked');
    assert.equal(result.brightDataUnlocked, true);
    assert.deepEqual(result.screenshots, [], 'API mode cannot produce screenshots');
  });

  it('successful URL → unlocker NOT called', async () => {
    const factory = makeRouterFactory({ 'http://ok.example.com': { kind: 'success' } });
    const unlocker = makeUnlockerSpy(() => ({ status: 200, html: UNLOCKED_HTML, finalUrl: '', title: '', error: '', attemptsUsed: 1 }));

    const session = createCrawlSession({
      settings: {
        brightDataUnlockerEnabled: true,
        brightDataApiKey: 'KEY',
        brightDataZone: 'z',
        crawleeProxyRetryEnabled: false,
      },
      plugins: [],
      _crawlerFactory: factory,
      _brightDataUnlocker: unlocker,
    });

    await runSingleUrlFetchPlan(session, 'http://ok.example.com');
    assert.equal(unlocker.calls.length, 0, 'success → no unlocker call');
  });

  it('unlocker returns auth error → URL stays blocked; brightDataUnlocked not set', async () => {
    const factory = makeRouterFactory({ 'http://blocked.example.com': { kind: 'blocked' } });
    const unlocker = makeUnlockerSpy(() => ({
      status: 401, html: '', finalUrl: '', title: '',
      error: 'brightdata_auth_401', attemptsUsed: 1,
    }));

    const session = createCrawlSession({
      settings: {
        brightDataUnlockerEnabled: true,
        brightDataApiKey: 'BAD',
        brightDataZone: 'z',
        crawleeProxyRetryEnabled: false,
      },
      plugins: [],
      _crawlerFactory: factory,
      _brightDataUnlocker: unlocker,
    });

    const { crawlResults } = await runSingleUrlFetchPlan(session, 'http://blocked.example.com');
    assert.equal(crawlResults[0].blocked, true, 'auth error → URL remains blocked');
    assert.equal(crawlResults[0].brightDataUnlocked, undefined);
  });

  it('robots_blocked URL → unlocker NOT called (respect robots.txt)', async () => {
    const factory = makeRouterFactory({ 'http://robots.example.com': { kind: 'robots' } });
    const unlocker = makeUnlockerSpy(() => ({ status: 200, html: UNLOCKED_HTML, finalUrl: '', title: '', error: '', attemptsUsed: 1 }));

    const session = createCrawlSession({
      settings: {
        brightDataUnlockerEnabled: true,
        brightDataApiKey: 'KEY',
        brightDataZone: 'z',
        crawleeProxyRetryEnabled: false,
      },
      plugins: [],
      _crawlerFactory: factory,
      _brightDataUnlocker: unlocker,
    });

    await runSingleUrlFetchPlan(session, 'http://robots.example.com');
    assert.equal(unlocker.calls.length, 0, 'robots_blocked must not be unlocked — respect robots.txt');
  });
});
