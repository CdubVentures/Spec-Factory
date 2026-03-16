import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFetcherStartContext } from '../src/features/indexing/orchestration/index.js';

test('buildFetcherStartContext assembles fetcher-start inputs and creates http fetcher factory', () => {
  class FakeHttpFetcher {
    constructor(config, logger) {
      this.config = config;
      this.logger = logger;
    }
  }

  const context = buildFetcherStartContext({
    fetcher: { id: 'fetcher' },
    fetcherMode: 'playwright',
    config: { dryRun: false },
    logger: { info() {} },
    fetcherConfig: { id: 'cfg' },
    HttpFetcherClass: FakeHttpFetcher,
  });

  assert.equal(context.fetcherMode, 'playwright');
  assert.equal(context.fetcherConfig.id, 'cfg');

  const created = context.createHttpFetcherFn({ id: 'next' }, { info() {} });
  assert.equal(created instanceof FakeHttpFetcher, true);
  assert.deepEqual(created.config, { id: 'next' });
});
