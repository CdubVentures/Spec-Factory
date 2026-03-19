import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchBootstrapContext } from '../src/features/indexing/orchestration/index.js';

test('buildResearchBootstrapContext maps runProduct research bootstrap inputs to phase contract keys', () => {
  const createFrontier = () => ({ load: async () => {} });
  const createUberAggressiveOrchestrator = () => ({ marker: 'orchestrator' });

  const context = buildResearchBootstrapContext({
    storage: { marker: 'storage' },
    config: {},
    logger: { marker: 'logger' },
    createFrontier,
    createUberAggressiveOrchestrator,
  });

  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.deepEqual(context.config, {});
  assert.deepEqual(context.logger, { marker: 'logger' });
  assert.equal(context.createFrontierFn, createFrontier);
  assert.equal(
    context.createUberAggressiveOrchestratorFn,
    createUberAggressiveOrchestrator,
  );
});
