import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannerBootstrapPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildPlannerBootstrapPhaseCallsiteContext maps runProduct planner-bootstrap callsite inputs to context keys', () => {
  const storage = { marker: 'storage' };
  const config = { marker: 'config' };
  const logger = { marker: 'logger' };
  const category = 'mouse';
  const job = { productId: 'mouse-1' };
  const categoryConfig = { fieldOrder: ['dpi'] };
  const requiredFields = ['dpi'];
  const createAdapterManager = () => ({ id: 'adapter-manager' });
  const loadSourceIntel = async () => ({ rows: [] });
  const createSourcePlanner = (...args) => ({ args });
  const syncRuntimeOverrides = async () => ({});
  const applyRuntimeOverridesToPlanner = () => {};

  const result = buildPlannerBootstrapPhaseCallsiteContext({
    storage,
    config,
    logger,
    category,
    job,
    categoryConfig,
    requiredFields,
    createAdapterManager,
    loadSourceIntel,
    createSourcePlanner,
    syncRuntimeOverrides,
    applyRuntimeOverridesToPlanner,
  });

  assert.equal(result.storage, storage);
  assert.equal(result.config, config);
  assert.equal(result.logger, logger);
  assert.equal(result.category, category);
  assert.equal(result.job, job);
  assert.equal(result.categoryConfig, categoryConfig);
  assert.equal(result.requiredFields, requiredFields);
  assert.equal(result.createAdapterManager, createAdapterManager);
  assert.equal(result.loadSourceIntel, loadSourceIntel);
  assert.equal(result.createSourcePlanner, createSourcePlanner);
  assert.equal(result.syncRuntimeOverrides, syncRuntimeOverrides);
  assert.equal(result.applyRuntimeOverridesToPlanner, applyRuntimeOverridesToPlanner);
});
