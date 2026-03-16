import test from 'node:test';
import assert from 'node:assert/strict';
import { runHypothesisFollowups } from '../src/features/indexing/orchestration/index.js';

test('runHypothesisFollowups seeds follow-up URLs, executes queue rounds, and stops when no candidate URLs remain', async () => {
  const infoLogs = [];
  const warnLogs = [];
  const processPlannerQueueCalls = [];
  const buildProvisionalCalls = [];
  const nextBestCalls = [];
  const enqueued = [];
  const provisionalByRound = [
    {
      hypothesisQueue: [
        { url: 'https://existing.example/spec' },
        { url: 'https://new.example/spec-1' },
        { url: 'https://new.example/spec-2' },
      ],
      missingRequiredFields: ['weight_g', 'shape'],
      criticalFieldsBelowPassTarget: ['weight_g'],
    },
    {
      hypothesisQueue: [{ url: 'https://existing.example/spec' }],
      missingRequiredFields: ['shape'],
      criticalFieldsBelowPassTarget: [],
    },
  ];

  const result = await runHypothesisFollowups({
    config: {
      hypothesisAutoFollowupRounds: 2,
      hypothesisFollowupUrlsPerRound: 2,
      maxRunSeconds: 999,
    },
    startMs: 0,
    logger: {
      info(name, payload) {
        infoLogs.push({ name, payload });
      },
      warn(name, payload) {
        warnLogs.push({ name, payload });
      },
    },
    planner: {
      enqueue(url, reason) {
        enqueued.push({ url, reason });
        return true;
      },
    },
    processPlannerQueueFn: async () => {
      processPlannerQueueCalls.push(true);
    },
    sourceResults: [
      { url: 'https://existing.example/spec', helper: false },
      { url: 'helper://synthetic/seed', helper: true },
    ],
    categoryConfig: { marker: 'categoryConfig' },
    fieldOrder: ['weight_g', 'shape'],
    anchors: { marker: 'anchors' },
    job: {
      identityLock: { brand: 'Logitech' },
    },
    productId: 'mouse-product',
    category: 'mouse',
    requiredFields: ['weight_g'],
    sourceIntel: {
      data: { domains: { 'existing.example': {} } },
    },
    buildProvisionalHypothesisQueueFn: (args) => {
      buildProvisionalCalls.push(args);
      return provisionalByRound[buildProvisionalCalls.length - 1];
    },
    nextBestUrlsFromHypothesesFn: ({ hypothesisQueue, limit }) => {
      nextBestCalls.push({ hypothesisQueue, limit });
      return hypothesisQueue;
    },
    isHelperSyntheticSourceFn: (source) => Boolean(source.helper),
    nowFn: () => 1000,
  });

  assert.deepEqual(result, {
    hypothesisFollowupRoundsExecuted: 1,
    hypothesisFollowupSeededUrls: 2,
  });
  assert.equal(processPlannerQueueCalls.length, 1);
  assert.equal(buildProvisionalCalls.length, 2);
  assert.equal(buildProvisionalCalls[0].sourceResults.length, 1);
  assert.equal(nextBestCalls.length, 2);
  assert.deepEqual(enqueued, [
    { url: 'https://new.example/spec-1', reason: 'hypothesis_followup:1' },
    { url: 'https://new.example/spec-2', reason: 'hypothesis_followup:1' },
  ]);
  assert.deepEqual(warnLogs, []);
  assert.equal(
    infoLogs.some(
      (row) => row.name === 'hypothesis_followup_round_started' && row.payload.round === 1 && row.payload.enqueued_urls === 2,
    ),
    true,
  );
  assert.equal(
    infoLogs.some(
      (row) => row.name === 'hypothesis_followup_skipped' && row.payload.round === 2 && row.payload.reason === 'no_candidate_urls',
    ),
    true,
  );
});

test('runHypothesisFollowups stops immediately when run time budget is exhausted', async () => {
  const warnLogs = [];
  let processPlannerQueueCalled = false;

  const result = await runHypothesisFollowups({
    config: {
      hypothesisAutoFollowupRounds: 3,
      hypothesisFollowupUrlsPerRound: 2,
      maxRunSeconds: 1,
    },
    startMs: 0,
    logger: {
      info() {},
      warn(name, payload) {
        warnLogs.push({ name, payload });
      },
    },
    planner: {
      enqueue() {
        return true;
      },
    },
    processPlannerQueueFn: async () => {
      processPlannerQueueCalled = true;
    },
    sourceResults: [],
    categoryConfig: {},
    fieldOrder: [],
    anchors: {},
    job: {},
    productId: 'mouse-product',
    category: 'mouse',
    requiredFields: [],
    sourceIntel: { data: { domains: {} } },
    buildProvisionalHypothesisQueueFn: () => ({
      hypothesisQueue: [],
      missingRequiredFields: [],
      criticalFieldsBelowPassTarget: [],
    }),
    nextBestUrlsFromHypothesesFn: () => [],
    isHelperSyntheticSourceFn: () => false,
    nowFn: () => 2000,
  });

  assert.deepEqual(result, {
    hypothesisFollowupRoundsExecuted: 0,
    hypothesisFollowupSeededUrls: 0,
  });
  assert.equal(processPlannerQueueCalled, false);
  assert.deepEqual(warnLogs, [
    {
      name: 'max_run_seconds_reached',
      payload: { maxRunSeconds: 1 },
    },
  ]);
});
