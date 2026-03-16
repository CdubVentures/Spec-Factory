import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannerBootstrapContext } from '../src/features/indexing/orchestration/index.js';

test('buildPlannerBootstrapContext maps runProduct planner bootstrap inputs to phase contract keys', () => {
  const createSourcePlanner = (...args) => ({ args });
  const context = buildPlannerBootstrapContext({
    storage: { marker: 'storage' },
    config: { marker: 'config' },
    logger: { marker: 'logger' },
    category: 'mouse',
    job: { productId: 'mouse-sample' },
    categoryConfig: { fieldOrder: ['dpi'] },
    requiredFields: ['dpi'],
    createAdapterManager: () => ({ marker: 'adapter-manager' }),
    loadSourceIntel: async () => ({ data: {} }),
    createSourcePlanner,
    syncRuntimeOverrides: async () => ({}),
    applyRuntimeOverridesToPlanner: () => {},
  });

  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.deepEqual(context.config, { marker: 'config' });
  assert.deepEqual(context.logger, { marker: 'logger' });
  assert.equal(context.category, 'mouse');
  assert.deepEqual(context.job, { productId: 'mouse-sample' });
  assert.deepEqual(context.categoryConfig, { fieldOrder: ['dpi'] });
  assert.deepEqual(context.requiredFields, ['dpi']);
  assert.equal(typeof context.createAdapterManagerFn, 'function');
  assert.equal(typeof context.loadSourceIntelFn, 'function');
  assert.equal(context.createSourcePlannerFn, createSourcePlanner);
  assert.equal(typeof context.syncRuntimeOverridesFn, 'function');
  assert.equal(typeof context.applyRuntimeOverridesToPlannerFn, 'function');
});
