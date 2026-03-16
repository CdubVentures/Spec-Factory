import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFetchSchedulerDrainPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildFetchSchedulerDrainPhaseCallsiteContext maps runProduct fetch-scheduler callsite inputs to context keys', () => {
  const planner = { hasNext: () => false };
  const config = { fetchSchedulerEnabled: true };
  const prepareNextPlannerSource = async () => ({ mode: 'stop' });
  const fetchFn = async () => ({ ok: true });
  const fetchWithModeFn = async () => ({ ok: true });
  const shouldSkipPreflight = () => false;
  const shouldStopScheduler = () => false;
  const classifyOutcomeFn = () => 'fetch_error';
  const handleSchedulerFetchError = () => {};
  const handleSchedulerSkipped = () => {};
  const emitSchedulerEvent = () => {};
  const createFetchScheduler = () => ({ drainQueue: async () => {} });

  const result = buildFetchSchedulerDrainPhaseCallsiteContext({
    planner,
    config,
    prepareNextPlannerSource,
    fetchFn,
    fetchWithModeFn,
    shouldSkipPreflight,
    shouldStopScheduler,
    classifyOutcomeFn,
    handleSchedulerFetchError,
    handleSchedulerSkipped,
    emitSchedulerEvent,
    createFetchScheduler,
  });

  assert.equal(result.planner, planner);
  assert.equal(result.config, config);
  assert.equal(result.prepareNextPlannerSource, prepareNextPlannerSource);
  assert.equal(result.fetchFn, fetchFn);
  assert.equal(result.fetchWithModeFn, fetchWithModeFn);
  assert.equal(result.shouldSkipPreflight, shouldSkipPreflight);
  assert.equal(result.shouldStopScheduler, shouldStopScheduler);
  assert.equal(result.classifyOutcomeFn, classifyOutcomeFn);
  assert.equal(result.handleSchedulerFetchError, handleSchedulerFetchError);
  assert.equal(result.handleSchedulerSkipped, handleSchedulerSkipped);
  assert.equal(result.emitSchedulerEvent, emitSchedulerEvent);
  assert.equal(result.createFetchScheduler, createFetchScheduler);
});
