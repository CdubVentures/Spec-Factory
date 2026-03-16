import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannerBootstrap } from '../src/features/indexing/orchestration/index.js';

test('createPlannerBootstrap wires planner dependencies and applies runtime overrides', async () => {
  const calls = {
    createAdapterManager: 0,
    loadSourceIntel: 0,
    createPlanner: 0,
    syncRuntimeOverrides: 0,
    applyRuntimeOverrides: 0,
  };
  const adapterManager = { marker: 'adapter-manager' };
  const planner = { marker: 'planner' };
  const runtimeOverrides = { force_high_fields: ['dpi'] };

  const result = await createPlannerBootstrap({
    storage: { marker: 'storage' },
    config: { marker: 'config' },
    logger: { marker: 'logger' },
    category: 'mouse',
    job: { productId: 'mouse-sample' },
    categoryConfig: { fieldOrder: ['dpi'] },
    requiredFields: ['dpi'],
    createAdapterManagerFn: (config, logger) => {
      calls.createAdapterManager += 1;
      assert.equal(config.marker, 'config');
      assert.equal(logger.marker, 'logger');
      return adapterManager;
    },
    loadSourceIntelFn: async ({ storage, config, category }) => {
      calls.loadSourceIntel += 1;
      assert.equal(storage.marker, 'storage');
      assert.equal(config.marker, 'config');
      assert.equal(category, 'mouse');
      return { data: { domains: { 'example.com': {} } } };
    },
    createSourcePlannerFn: (job, config, categoryConfig, options) => {
      calls.createPlanner += 1;
      assert.equal(job.productId, 'mouse-sample');
      assert.equal(config.marker, 'config');
      assert.deepEqual(categoryConfig, { fieldOrder: ['dpi'] });
      assert.deepEqual(options.requiredFields, ['dpi']);
      assert.deepEqual(options.sourceIntel, { domains: { 'example.com': {} } });
      return planner;
    },
    syncRuntimeOverridesFn: async ({ force } = {}) => {
      calls.syncRuntimeOverrides += 1;
      assert.equal(force, true);
      return runtimeOverrides;
    },
    applyRuntimeOverridesToPlannerFn: (plannerArg, runtimeOverridesArg) => {
      calls.applyRuntimeOverrides += 1;
      assert.equal(plannerArg, planner);
      assert.equal(runtimeOverridesArg, runtimeOverrides);
    },
  });

  assert.equal(calls.createAdapterManager, 1);
  assert.equal(calls.loadSourceIntel, 1);
  assert.equal(calls.createPlanner, 1);
  assert.equal(calls.syncRuntimeOverrides, 1);
  assert.equal(calls.applyRuntimeOverrides, 1);
  assert.equal(result.adapterManager, adapterManager);
  assert.deepEqual(result.sourceIntel, { data: { domains: { 'example.com': {} } } });
  assert.equal(result.planner, planner);
  assert.equal(result.runtimeOverrides, runtimeOverrides);
});
