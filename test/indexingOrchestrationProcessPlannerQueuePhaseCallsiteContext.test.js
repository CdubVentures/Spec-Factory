import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProcessPlannerQueuePhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildProcessPlannerQueuePhaseCallsiteContext maps runProduct process-planner-queue callsite inputs to context keys', () => {
  const maybeApplyBlockedDomainCooldown = () => {};
  const planner = { hasNext: () => false };
  const logger = { info() {}, warn() {}, error() {} };
  const config = { maxRunSeconds: 60 };
  const createFetchScheduler = () => ({ drainQueue: async () => {} });

  const result = buildProcessPlannerQueuePhaseCallsiteContext({
    maybeApplyBlockedDomainCooldown,
    planner,
    logger,
    config,
    createFetchScheduler,
  });

  assert.equal(typeof result.runPlannerQueueDispatchPhaseFn, 'function');
  assert.equal(typeof result.plannerQueueRuntime?.buildPlannerQueueDispatchInput, 'function');
  assert.equal(Object.hasOwn(result, 'context'), false);

  const dispatchInput = result.plannerQueueRuntime.buildPlannerQueueDispatchInput({
    state: {
      runtimePauseAnnounced: true,
      fetchWorkerSeq: 2,
      artifactSequence: 5,
      runtimeOverrides: { blocked_domains: ['runtime.example.com'] },
    },
  });

  assert.equal(dispatchInput.planner, planner);
  assert.equal(dispatchInput.logger, logger);
  assert.equal(dispatchInput.config, config);
  assert.equal(dispatchInput.createFetchScheduler, createFetchScheduler);
  assert.equal(dispatchInput.runtimePauseAnnounced, true);
  assert.equal(dispatchInput.fetchWorkerSeq, 2);
  assert.equal(dispatchInput.artifactSequence, 5);
});
