import test from 'node:test';
import assert from 'node:assert/strict';
import { registerConfigRoutes } from '../../../settings/api/configRoutes.js';
import { registerQueueBillingLearningRoutes } from '../queueBillingLearningRoutes.js';

function makeConfigCtx(overrides = {}) {
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    config: {},
    toInt: (value, fallback = 0) => {
      const n = Number.parseInt(String(value ?? ''), 10);
      return Number.isFinite(n) ? n : fallback;
    },
    collectLlmModels: () => [],
    llmProviderFromModel: () => '',
    resolvePricingForModel: () => ({}),
    resolveTokenProfileForModel: () => ({}),
    resolveLlmRoleDefaults: () => ({}),
    resolveLlmKnobDefaults: () => ({}),
    llmRoutingSnapshot: () => ({}),
    buildLlmMetrics: async () => ({}),
    buildIndexingDomainChecklist: async () => ({}),
    buildReviewMetrics: async () => ({}),
    getSpecDb: () => null,
    storage: {},
    OUTPUT_ROOT: 'out',
    broadcastWs: () => {},
  };
  return { ...ctx, ...overrides };
}

function makeQueueCtx(overrides = {}) {
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    toInt: (value, fallback = 0) => {
      const n = Number.parseInt(String(value ?? ''), 10);
      return Number.isFinite(n) ? n : fallback;
    },
    config: {},
    storage: {},
    OUTPUT_ROOT: 'out',
    path: { join: (...parts) => parts.join('/') },
    getSpecDb: () => null,
    buildReviewQueue: async () => [],
    loadQueueState: async () => ({ state: { products: {} } }),
    saveQueueState: async () => ({ ok: true }),
    upsertQueueProduct: async () => ({ ok: true }),
    broadcastWs: () => {},
    safeReadJson: async () => null,
    safeStat: async () => null,
    listFiles: async () => [],
  };
  return { ...ctx, ...overrides };
}

test('config routes: llm settings update emits typed data-change contract', async () => {
  const emitted = [];
  const specDb = {
    saveLlmRouteMatrix: (rows) => rows,
  };
  const handler = registerConfigRoutes(makeConfigCtx({
    readJsonBody: async () => ({ rows: [{ scope: 'extract', role: 'extract', model: 'gpt-5-mini' }] }),
    getSpecDb: (category) => (category === 'mouse' ? specDb : null),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(['llm-settings', 'mouse', 'routes'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'llm-settings-updated');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.deepEqual(emitted[0].payload.categories, ['mouse']);
  assert.deepEqual(emitted[0].payload.domains, ['settings', 'indexing']);
});

test('queue routes: retry emits typed data-change contract', async () => {
  const emitted = [];
  const handler = registerQueueBillingLearningRoutes(makeQueueCtx({
    readJsonBody: async () => ({ productId: 'mouse-razer-viper-v3-pro' }),
    upsertQueueProduct: async () => ({ ok: true }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(['queue', 'mouse', 'retry'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'queue-retry');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.deepEqual(emitted[0].payload.categories, ['mouse']);
  assert.deepEqual(emitted[0].payload.domains, ['queue']);
  assert.deepEqual(emitted[0].payload.entities.productIds, ['mouse-razer-viper-v3-pro']);
});
