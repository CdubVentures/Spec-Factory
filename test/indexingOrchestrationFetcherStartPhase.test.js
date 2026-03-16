import test from 'node:test';
import assert from 'node:assert/strict';
import { runFetcherStartPhase } from '../src/features/indexing/orchestration/index.js';

test('runFetcherStartPhase keeps current fetcher/mode when start succeeds', async () => {
  const fetcher = {
    async start() {
      return undefined;
    },
  };

  const result = await runFetcherStartPhase({
    fetcher,
    fetcherMode: 'playwright',
    config: { dryRun: false },
    logger: { warn() {}, info() {} },
    fetcherConfig: { id: 'cfg' },
    createHttpFetcherFn: () => {
      throw new Error('should not create fallback fetcher');
    },
  });

  assert.equal(result.fetcher, fetcher);
  assert.equal(result.fetcherMode, 'playwright');
  assert.equal(result.fetcherStartFallbackReason, null);
});

test('runFetcherStartPhase falls back to http fetcher when start fails outside dry-run/http mode', async () => {
  const logs = [];
  const primaryFetcher = {
    async start() {
      throw new Error('start_failed');
    },
  };
  const fallbackFetcher = {
    async start() {
      return undefined;
    },
  };

  const result = await runFetcherStartPhase({
    fetcher: primaryFetcher,
    fetcherMode: 'playwright',
    config: { dryRun: false },
    logger: {
      warn(eventName, payload) {
        logs.push({ level: 'warn', eventName, payload });
      },
      info(eventName, payload) {
        logs.push({ level: 'info', eventName, payload });
      },
    },
    fetcherConfig: { id: 'cfg' },
    createHttpFetcherFn: (configArg, loggerArg) => {
      assert.deepEqual(configArg, { id: 'cfg' });
      assert.ok(loggerArg);
      return fallbackFetcher;
    },
  });

  assert.equal(result.fetcher, fallbackFetcher);
  assert.equal(result.fetcherMode, 'http');
  assert.equal(result.fetcherStartFallbackReason, 'start_failed');
  assert.deepEqual(logs, [
    {
      level: 'warn',
      eventName: 'fetcher_start_failed',
      payload: { fetcher_mode: 'playwright', message: 'start_failed' },
    },
    {
      level: 'info',
      eventName: 'fetcher_fallback_enabled',
      payload: { fetcher_mode: 'http' },
    },
  ]);
});

test('runFetcherStartPhase rethrows startup failure in dry-run mode', async () => {
  const expectedError = new Error('dry_run_start_failed');
  const primaryFetcher = {
    async start() {
      throw expectedError;
    },
  };
  let fallbackCreated = false;

  await assert.rejects(
    runFetcherStartPhase({
      fetcher: primaryFetcher,
      fetcherMode: 'playwright',
      config: { dryRun: true },
      logger: { warn() {}, info() {} },
      fetcherConfig: { id: 'cfg' },
      createHttpFetcherFn: () => {
        fallbackCreated = true;
        return { async start() {} };
      },
    }),
    expectedError,
  );
  assert.equal(fallbackCreated, false);
});
