import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../../config.js';
import { withSavedEnv } from './helpers/configTestHarness.js';

test('config: parses crawlee env flags', () => {
  return withSavedEnv(['CRAWLEE_HEADLESS', 'CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS'], () => {
    process.env.CRAWLEE_HEADLESS = 'false';
    process.env.CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS = '75';

    const cfg = loadConfig();
    assert.equal(cfg.crawleeHeadless, false);
    assert.equal(cfg.crawleeRequestHandlerTimeoutSecs, 75);
  });
});
