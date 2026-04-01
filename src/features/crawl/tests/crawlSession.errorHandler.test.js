import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrawlSession } from '../crawlSession.js';
import { createLoggerSpy } from './factories/crawlTestDoubles.js';

/**
 * errorHandler noRetry classification — which errors allow retries, which don't.
 *
 * Pattern: inline factory double calls config.errorHandler() directly,
 * then asserts reqObj.noRetry. Same approach as crawlSession.timeoutRescue.test.js.
 */

// WHY: Helper — creates a crawlSession with a factory that captures the
// errorHandler config, then runs it against a synthetic request + error.
async function runErrorHandler({ errorMsg, retryCount = 0, userData = {}, settings = {} } = {}) {
  let noRetryResult = null;
  let sessionRetired = false;

  const { logger, infoCalls } = createLoggerSpy();

  const factory = (config) => ({
    async run(requests = []) {
      for (const request of requests) {
        const reqObj = {
          url: request.url,
          uniqueKey: request.uniqueKey,
          userData,
          retryCount,
          noRetry: false,
        };
        const sessionDouble = { retire: () => { sessionRetired = true; } };

        await config.errorHandler(
          { request: reqObj, session: sessionDouble },
          new Error(errorMsg),
        );
        noRetryResult = reqObj.noRetry;

        // Always call failedRequestHandler so processUrl resolves
        await config.failedRequestHandler(
          { request: reqObj },
          new Error(errorMsg),
        );
      }
    },
    async teardown() {},
  });

  const session = createCrawlSession({
    settings,
    plugins: [],
    logger,
    _crawlerFactory: factory,
  });

  await session.processUrl('https://example.com/test');

  return { noRetry: noRetryResult, sessionRetired, infoCalls };
}


// ── blocked:* errors — noRetry immediately ──────────────────────────

describe('errorHandler: blocked errors set noRetry', () => {
  const BLOCKED_ERRORS = [
    'blocked:status_403',
    'blocked:status_429',
    'blocked:captcha_detected',
    'blocked:cloudflare_challenge',
    'blocked:access_denied',
    'blocked:empty_response',
    'blocked:server_error',
    'blocked:no_response',
    'blocked:robots_blocked',
  ];

  for (const errorMsg of BLOCKED_ERRORS) {
    it(`${errorMsg} → noRetry = true`, async () => {
      const { noRetry } = await runErrorHandler({ errorMsg });
      assert.equal(noRetry, true, `${errorMsg} should set noRetry`);
    });
  }
});


// ── Infrastructure errors — noRetry immediately (regression guard) ──

describe('errorHandler: infrastructure errors set noRetry (regression)', () => {
  const INFRA_ERRORS = [
    'Download is starting',
    'ERR_NAME_NOT_RESOLVED',
    'ERR_CONNECTION_REFUSED',
    'ERR_CONNECTION_RESET',
    'ERR_TUNNEL_CONNECTION_FAILED',
    'Navigation timed out after 20000ms',
  ];

  for (const errorMsg of INFRA_ERRORS) {
    it(`${errorMsg} → noRetry = true`, async () => {
      const { noRetry } = await runErrorHandler({ errorMsg });
      assert.equal(noRetry, true, `${errorMsg} should set noRetry`);
    });
  }
});


// ── Handler timeout — conditional noRetry ───────────────────────────

describe('errorHandler: handler timeout noRetry classification', () => {
  it('timeout WITH __capturedPage → noRetry = true (existing behavior)', async () => {
    const { noRetry } = await runErrorHandler({
      errorMsg: 'requestHandler timed out after 45 seconds.',
      retryCount: 0,
      userData: { __capturedPage: { html: '<html>real</html>', finalUrl: 'https://example.com', title: 'T', status: 200 } },
    });
    assert.equal(noRetry, true, 'page already captured — retrying wastes 45s');
  });

  it('timeout WITHOUT __capturedPage at retryCount 0 → noRetry = false (allow first retry)', async () => {
    const { noRetry } = await runErrorHandler({
      errorMsg: 'requestHandler timed out after 45 seconds.',
      retryCount: 0,
      userData: {},
    });
    assert.equal(noRetry, false, 'first attempt — allow retry, page might load next time');
  });

  it('timeout WITHOUT __capturedPage at retryCount 1 → noRetry = true (stop retrying)', async () => {
    const { noRetry } = await runErrorHandler({
      errorMsg: 'requestHandler timed out after 45 seconds.',
      retryCount: 1,
      userData: {},
    });
    assert.equal(noRetry, true, 'already retried once — page is genuinely slow, stop');
  });

  it('timeout WITHOUT __capturedPage at retryCount 2 → noRetry = true', async () => {
    const { noRetry } = await runErrorHandler({
      errorMsg: 'requestHandler timed out after 45 seconds.',
      retryCount: 2,
      userData: {},
    });
    assert.equal(noRetry, true, 'retryCount >= 1 always stops');
  });
});


// ── Session retirement for retryable errors ─────────────────────────

describe('errorHandler: session retirement', () => {
  it('retryable error (unknown) → session.retire() called', async () => {
    const { sessionRetired, noRetry } = await runErrorHandler({
      errorMsg: 'some transient error',
      retryCount: 0,
    });
    assert.equal(noRetry, false, 'unknown error should allow retry');
    assert.equal(sessionRetired, true, 'session should be retired so retry uses fresh fingerprint');
  });

  it('noRetry error (blocked) → session.retire() NOT called', async () => {
    const { sessionRetired, noRetry } = await runErrorHandler({
      errorMsg: 'blocked:status_403',
    });
    assert.equal(noRetry, true);
    assert.equal(sessionRetired, false, 'no retry will happen — no need to retire session');
  });

  it('noRetry error (DNS) → session.retire() NOT called', async () => {
    const { sessionRetired } = await runErrorHandler({
      errorMsg: 'ERR_NAME_NOT_RESOLVED',
    });
    assert.equal(sessionRetired, false, 'no retry will happen — no need to retire session');
  });
});


// ── Retrying signal suppression ─────────────────────────────────────

describe('errorHandler: retrying signal emission', () => {
  it('noRetry error does NOT emit source_fetch_retrying', async () => {
    const { infoCalls } = await runErrorHandler({
      errorMsg: 'blocked:status_403',
    });
    const retryEvents = infoCalls.filter((c) => c.event === 'source_fetch_retrying');
    assert.equal(retryEvents.length, 0, 'no retrying event — noRetry was set');
  });

  it('retryable error emits source_fetch_retrying', async () => {
    const { infoCalls } = await runErrorHandler({
      errorMsg: 'some transient error',
      retryCount: 0,
    });
    const retryEvents = infoCalls.filter((c) => c.event === 'source_fetch_retrying');
    assert.equal(retryEvents.length, 1, 'should emit retrying signal for retryable error');
  });
});
