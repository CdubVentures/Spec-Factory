import test from 'node:test';
import assert from 'node:assert/strict';
import { runFetchSchedulerDrain } from '../src/features/indexing/orchestration/index.js';

test('runFetchSchedulerDrain prefetches process entries, wires scheduler callbacks, and forwards scheduler config', async () => {
  const sequence = [
    { mode: 'skip' },
    { mode: 'process', source: { url: 'https://a.example' }, sourceHost: 'a.example', hostBudgetRow: {} },
    { mode: 'process', source: { url: 'https://b.example' }, sourceHost: 'b.example', hostBudgetRow: {}, skip: true },
    { mode: 'stop' },
  ];
  let nextIndex = 0;
  const planner = {
    hasNext() {
      return nextIndex < sequence.length;
    },
  };
  const prepareCalls = [];
  const fetchCalls = [];
  const skippedCalls = [];
  const errorCalls = [];
  const emitted = [];
  const schedulerConfigCalls = [];
  const drainCalls = [];
  const fetchedUrls = [];
  const modeFetchCalls = [];
  const classifiedOutcomes = [];

  await runFetchSchedulerDrain({
    planner,
    config: {
      concurrency: 7,
      perHostMinDelayMs: 222,
      fetchSchedulerMaxRetries: 3,
      fetchSchedulerDefaultConcurrency: 4,
      fetchSchedulerDefaultDelayMs: 333,
      fetchSchedulerDefaultMaxRetries: 2,
      fetchSchedulerRetryWaitMs: 444,
    },
    initialMode: 'http',
    prepareNextPlannerSourceFn: async () => {
      const row = sequence[nextIndex++];
      prepareCalls.push(row.mode);
      return row;
    },
    fetchFn: async (preflight) => {
      fetchCalls.push(preflight.source.url);
      fetchedUrls.push(preflight.source.url);
      return { ok: true };
    },
    fetchWithModeFn: async (preflight, mode) => {
      modeFetchCalls.push({ url: preflight.source.url, mode });
      return { ok: true };
    },
    shouldSkipFn: (preflight) => Boolean(preflight.skip),
    shouldStopFn: () => false,
    classifyOutcomeFn: (error) => {
      classifiedOutcomes.push(String(error?.message || ''));
      return 'fetch_error';
    },
    onFetchError: (preflight, error) => {
      errorCalls.push({ preflight, error });
    },
    onSkipped: (preflight) => {
      skippedCalls.push(preflight.source.url);
    },
    emitEvent: (name, payload) => {
      emitted.push({ name, payload });
    },
    createFetchSchedulerFn: (config) => {
      schedulerConfigCalls.push(config);
      return {
        async drainQueue(args) {
          drainCalls.push(args);
        while (args.sources.hasNext()) {
          const scheduledSource = args.sources.next();
          if (args.shouldSkip(scheduledSource)) {
            args.onSkipped(scheduledSource);
            continue;
          }
          assert.equal(args.initialMode, 'http');
          assert.equal(scheduledSource.url, 'https://a.example');
          assert.equal(scheduledSource.host, 'a.example');
          assert.equal(scheduledSource.source.url, 'https://a.example');
          await args.fetchFn(scheduledSource);
            await args.fetchWithMode(scheduledSource, 'playwright');
            args.classifyOutcome(new Error('blocked'));
          }
        },
      };
    },
  });

  assert.deepEqual(prepareCalls, ['skip', 'process', 'process', 'stop']);
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(fetchedUrls, ['https://a.example']);
  assert.deepEqual(skippedCalls, ['https://b.example']);
  assert.equal(errorCalls.length, 0);
  assert.equal(emitted.length, 0);
  assert.equal(schedulerConfigCalls.length, 1);
  assert.equal(drainCalls.length, 1);
  assert.deepEqual(modeFetchCalls, [{ url: 'https://a.example', mode: 'playwright' }]);
  assert.deepEqual(classifiedOutcomes, ['blocked']);
  assert.deepEqual(schedulerConfigCalls[0], {
    concurrency: 7,
    perHostDelayMs: 222,
    maxRetries: 3,
    defaultConcurrency: 4,
    defaultPerHostDelayMs: 333,
    defaultMaxRetries: 2,
    retryWaitMs: 444,
  });
});
