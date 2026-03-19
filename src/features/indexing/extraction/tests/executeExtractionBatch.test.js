import test from 'node:test';
import assert from 'node:assert/strict';

import { executeExtractionBatch } from '../executeExtractionBatch.js';

function buildSanitizedResult(fieldCandidates = []) {
  return {
    identityCandidates: {},
    fieldCandidates,
    conflicts: [],
    notes: []
  };
}

test('executeExtractionBatch returns cached results without invoking the model', async () => {
  const cached = buildSanitizedResult([
    {
      field: 'sensor',
      value: 'Focus Pro 35K',
      evidenceRefs: ['ref-sensor']
    }
  ]);
  const cacheOps = [];
  let invoked = false;

  const result = await executeExtractionBatch({
    batchId: 'batch-cache',
    productId: 'mouse-cache',
    cache: {
      async get(key) {
        cacheOps.push(['get', key]);
        return cached;
      },
      async set() {
        throw new Error('cache set should not run on cache hit');
      }
    },
    cacheKey: 'cache-key-1',
    invokeModel: async () => {
      invoked = true;
      return buildSanitizedResult();
    },
    primaryRequest: {
      model: 'fast-model',
      reason: 'extract_batch:batch-cache'
    }
  });

  assert.equal(invoked, false);
  assert.deepEqual(cacheOps, [['get', 'cache-key-1']]);
  assert.equal(result.cacheHit, true);
  assert.deepEqual(result.notes, []);
  assert.deepEqual(result.sanitized, cached);
});

test('executeExtractionBatch upgrades the batch result when repatch finds more candidates', async () => {
  const invocations = [];
  const cacheWrites = [];
  const primary = buildSanitizedResult();
  const repatched = buildSanitizedResult([
    {
      field: 'sensor',
      value: 'Focus Pro 35K',
      evidenceRefs: ['ref-sensor']
    }
  ]);

  const result = await executeExtractionBatch({
    batchId: 'batch-repatch',
    productId: 'mouse-repatch',
    cache: {
      async get() {
        return null;
      },
      async set(key, value) {
        cacheWrites.push([key, value]);
      }
    },
    cacheKey: 'cache-key-2',
    invokeModel: async (request) => {
      invocations.push(request);
      return request.model === 'repatch-model' ? repatched : primary;
    },
    primaryRequest: {
      model: 'fast-model',
      reason: 'extract_batch:batch-repatch'
    },
    repatchRequest: {
      model: 'repatch-model',
      reason: 'extract_batch:batch-repatch_repatch',
      reasoningMode: true
    }
  });

  assert.deepEqual(
    invocations.map((request) => ({
      model: request.model,
      reason: request.reason,
      reasoningMode: request.reasoningMode
    })),
    [
      {
        model: 'fast-model',
        reason: 'extract_batch:batch-repatch',
        reasoningMode: undefined
      },
      {
        model: 'repatch-model',
        reason: 'extract_batch:batch-repatch_repatch',
        reasoningMode: true
      }
    ]
  );
  assert.equal(result.cacheHit, false);
  assert.deepEqual(result.notes, []);
  assert.deepEqual(result.sanitized, repatched);
  assert.deepEqual(cacheWrites, [['cache-key-2', repatched]]);
});

test('executeExtractionBatch records a note when provider pin disables repatch', async () => {
  const infoEvents = [];
  let invokeCount = 0;
  const primary = buildSanitizedResult();

  const result = await executeExtractionBatch({
    batchId: 'batch-provider-pin',
    productId: 'mouse-provider-pin',
    providerPinEnabled: true,
    logger: {
      info(event, payload) {
        infoEvents.push([event, payload]);
      }
    },
    invokeModel: async () => {
      invokeCount += 1;
      return primary;
    },
    primaryRequest: {
      model: 'fast-model',
      reason: 'extract_batch:batch-provider-pin'
    },
    repatchRequest: {
      model: 'repatch-model',
      reason: 'extract_batch:batch-provider-pin_repatch',
      reasoningMode: true
    }
  });

  assert.equal(invokeCount, 1);
  assert.equal(infoEvents[0][0], 'llm_extract_batch_repatch_skipped_provider_pin');
  assert.deepEqual(result.sanitized, primary);
  assert.deepEqual(result.notes, ['Batch batch-provider-pin repatch skipped by provider pin.']);
});
