import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchBootstrapPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildResearchBootstrapPhaseCallsiteContext maps runProduct research-bootstrap callsite inputs to context keys', () => {
  const storage = { marker: 'storage' };
  const config = { frontierEnableSqlite: true };
  const logger = { marker: 'logger' };
  const createFrontier = () => ({ load: async () => {} });
  const createUberAggressiveOrchestrator = (options) => ({ options });

  const result = buildResearchBootstrapPhaseCallsiteContext({
    storage,
    config,
    logger,
    createFrontier,
    createUberAggressiveOrchestrator,
  });

  assert.equal(result.storage, storage);
  assert.equal(result.config, config);
  assert.equal(result.logger, logger);
  assert.equal(result.createFrontier, createFrontier);
  assert.equal(result.createUberAggressiveOrchestrator, createUberAggressiveOrchestrator);
});
