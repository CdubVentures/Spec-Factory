import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFetchSchedulerDrainContext } from '../src/features/indexing/orchestration/index.js';

test('buildFetchSchedulerDrainContext maps runProduct scheduler inputs to drain contract keys', () => {
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

  const context = buildFetchSchedulerDrainContext({
    planner: { hasNext: () => false },
    config: { fetchSchedulerEnabled: true },
    initialMode: 'http',
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

  assert.equal(typeof context.planner.hasNext, 'function');
  assert.deepEqual(context.config, { fetchSchedulerEnabled: true });
  assert.equal(context.initialMode, 'http');
  assert.equal(context.prepareNextPlannerSourceFn, prepareNextPlannerSource);
  assert.equal(context.fetchFn, fetchFn);
  assert.equal(context.fetchWithModeFn, fetchWithModeFn);
  assert.equal(context.shouldSkipFn, shouldSkipPreflight);
  assert.equal(context.shouldStopFn, shouldStopScheduler);
  assert.equal(context.classifyOutcomeFn, classifyOutcomeFn);
  assert.equal(context.onFetchError, handleSchedulerFetchError);
  assert.equal(context.onSkipped, handleSchedulerSkipped);
  assert.equal(context.emitEvent, emitSchedulerEvent);
  assert.equal(context.createFetchSchedulerFn, createFetchScheduler);
});
