import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getPageContentWithRetry } from '../getPageContent.js';

function makePageWithResponses(responses) {
  let call = 0;
  return {
    content: async () => {
      const r = responses[call++];
      if (r instanceof Error) throw r;
      return r;
    },
    waitForLoadState: async () => {},
    url: () => 'https://example.com/',
    _callCount: () => call,
  };
}

describe('getPageContentWithRetry', () => {
  test('returns html on first-call success (happy path)', async () => {
    const page = makePageWithResponses(['<html>ok</html>']);
    const html = await getPageContentWithRetry(page);
    assert.equal(html, '<html>ok</html>');
    assert.equal(page._callCount(), 1);
  });

  test('retries once on "Execution context was destroyed" (SPA nav-race)', async () => {
    const navErr = new Error('Execution context was destroyed, most likely because of a navigation.');
    const page = makePageWithResponses([navErr, '<html>recovered</html>']);
    const html = await getPageContentWithRetry(page);
    assert.equal(html, '<html>recovered</html>');
    assert.equal(page._callCount(), 2);
  });

  test('retries on "Navigation failed" error shape', async () => {
    const navErr = new Error('Navigation failed while waiting for frame');
    const page = makePageWithResponses([navErr, '<html>recovered</html>']);
    const html = await getPageContentWithRetry(page);
    assert.equal(html, '<html>recovered</html>');
  });

  test('retries on "frame was detached" error shape', async () => {
    const navErr = new Error('page.content: Target page, context or browser has been closed');
    const page = makePageWithResponses([navErr, '<html>recovered</html>']);
    const html = await getPageContentWithRetry(page);
    assert.equal(html, '<html>recovered</html>');
  });

  test('throws when nav-race fails twice (no infinite retry)', async () => {
    const navErr1 = new Error('Execution context was destroyed');
    const navErr2 = new Error('Execution context was destroyed');
    const page = makePageWithResponses([navErr1, navErr2]);
    await assert.rejects(
      () => getPageContentWithRetry(page),
      /Execution context was destroyed/,
    );
    assert.equal(page._callCount(), 2);
  });

  test('throws immediately on non-nav-race errors (no retry)', async () => {
    const genericErr = new Error('Some other playwright error');
    const page = makePageWithResponses([genericErr]);
    await assert.rejects(
      () => getPageContentWithRetry(page),
      /Some other playwright error/,
    );
    assert.equal(page._callCount(), 1, 'should only call once — no retry for non-nav errors');
  });

  test('calls waitForLoadState("networkidle") between retry attempts', async () => {
    const navErr = new Error('Execution context was destroyed');
    const waitCalls = [];
    const page = {
      content: (() => {
        let n = 0;
        return async () => {
          n++;
          if (n === 1) throw navErr;
          return '<html>ok</html>';
        };
      })(),
      waitForLoadState: async (state) => { waitCalls.push(state); },
      url: () => 'https://example.com/',
    };
    await getPageContentWithRetry(page);
    assert.deepEqual(waitCalls, ['networkidle']);
  });

  test('emits page_content_retry logger event on retry', async () => {
    const navErr = new Error('Execution context was destroyed');
    const page = makePageWithResponses([navErr, '<html>ok</html>']);
    const events = [];
    const logger = { info: (event, data) => events.push({ event, data }) };
    await getPageContentWithRetry(page, { logger });
    const retryEvent = events.find((e) => e.event === 'page_content_retry');
    assert.ok(retryEvent, 'expected page_content_retry event');
    assert.equal(retryEvent.data.url, 'https://example.com/');
    assert.ok(retryEvent.data.error, 'event payload should include error message');
  });

  test('does not emit retry event on first-call success', async () => {
    const page = makePageWithResponses(['<html>ok</html>']);
    const events = [];
    const logger = { info: (event) => events.push(event) };
    await getPageContentWithRetry(page, { logger });
    assert.ok(!events.includes('page_content_retry'));
  });

  test('respects waitForLoadState timeout budget (does not hang if networkidle never fires)', async () => {
    const navErr = new Error('Execution context was destroyed');
    const page = {
      content: (() => {
        let n = 0;
        return async () => {
          n++;
          if (n === 1) throw navErr;
          return '<html>ok</html>';
        };
      })(),
      // Simulate networkidle never settling — handler should still proceed to retry
      waitForLoadState: async () => { throw new Error('Timeout 5000ms exceeded'); },
      url: () => 'https://example.com/',
    };
    const html = await getPageContentWithRetry(page);
    assert.equal(html, '<html>ok</html>');
  });
});
