import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFetcherStartPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildFetcherStartPhaseCallsiteContext maps runProduct fetcher-start callsite inputs to context keys', () => {
  class FakeHttpFetcher {}

  const fetcher = { id: 'fetcher' };
  const fetcherMode = 'playwright';
  const config = { dryRun: false };
  const logger = { info() {} };
  const fetcherConfig = { concurrency: 4 };

  const result = buildFetcherStartPhaseCallsiteContext({
    fetcher,
    fetcherMode,
    config,
    logger,
    fetcherConfig,
    HttpFetcherClass: FakeHttpFetcher,
  });

  assert.equal(result.fetcher, fetcher);
  assert.equal(result.fetcherMode, fetcherMode);
  assert.equal(result.config, config);
  assert.equal(result.logger, logger);
  assert.equal(result.fetcherConfig, fetcherConfig);
  assert.equal(result.HttpFetcherClass, FakeHttpFetcher);
});
