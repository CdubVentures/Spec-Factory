import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchBootstrap } from '../src/features/indexing/orchestration/index.js';

test('createResearchBootstrap creates frontier and orchestrator', async () => {
  const createdFrontierOptions = [];
  const createdOrchestratorOptions = [];
  const loadCalls = [];
  const frontier = {
    async load() {
      loadCalls.push('load');
    },
  };

  const result = await createResearchBootstrap({
    storage: {
      resolveOutputKey(key) {
        return `resolved/${key}`;
      },
    },
    config: {
      frontierDbPath: 'custom/frontier.json',
      s3OutputPrefix: 'specs/outputs',
    },
    logger: { marker: 'logger' },
    createFrontierFn: (options) => {
      createdFrontierOptions.push(options);
      return frontier;
    },
    createUberAggressiveOrchestratorFn: (options) => {
      createdOrchestratorOptions.push(options);
      return { marker: 'orchestrator' };
    },
  });

  assert.equal(loadCalls.length, 1);
  assert.equal(createdFrontierOptions.length, 1);
  assert.equal(createdFrontierOptions[0].key, 'resolved/custom/frontier.json');
  assert.equal(createdFrontierOptions[0].storage.resolveOutputKey('x'), 'resolved/x');
  assert.equal(createdFrontierOptions[0].config._logger.marker, 'logger');
  assert.equal(createdOrchestratorOptions.length, 1);
  assert.equal(createdOrchestratorOptions[0].frontier, frontier);
  assert.equal(result.frontierDb, frontier);
  assert.equal(result.uberOrchestrator.marker, 'orchestrator');
});

test('createResearchBootstrap keeps already-prefixed frontier path without resolveOutputKey mutation', async () => {
  const createdFrontierOptions = [];
  const result = await createResearchBootstrap({
    storage: {
      resolveOutputKey() {
        throw new Error('resolveOutputKey should not be called for already-prefixed key');
      },
    },
    config: {
      frontierDbPath: 'specs/outputs/_intel/frontier/frontier.json',
      s3OutputPrefix: 'specs/outputs',
    },
    logger: { marker: 'logger' },
    createFrontierFn: (options) => {
      createdFrontierOptions.push(options);
      return { load: async () => {} };
    },
    createUberAggressiveOrchestratorFn: () => ({ marker: 'orchestrator' }),
  });

  assert.equal(createdFrontierOptions.length, 1);
  assert.equal(createdFrontierOptions[0].key, 'specs/outputs/_intel/frontier/frontier.json');
  assert.equal(result.frontierDb && typeof result.frontierDb.load, 'function');
});
