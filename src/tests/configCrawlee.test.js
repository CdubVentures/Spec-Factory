import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../config.js';

test('config: parses crawlee env flags', () => {
  const prevHeadless = process.env.CRAWLEE_HEADLESS;
  const prevTimeout = process.env.CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS;
  try {
    process.env.CRAWLEE_HEADLESS = 'false';
    process.env.CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS = '75';

    const cfg = loadConfig({ runProfile: 'standard' });
    assert.equal(cfg.crawleeHeadless, false);
    assert.equal(cfg.crawleeRequestHandlerTimeoutSecs, 75);
  } finally {
    if (prevHeadless === undefined) delete process.env.CRAWLEE_HEADLESS;
    else process.env.CRAWLEE_HEADLESS = prevHeadless;
    if (prevTimeout === undefined) delete process.env.CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS;
    else process.env.CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS = prevTimeout;
  }
});
