import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapRunConfig } from '../bootstrapRunProductExecutionState.js';

// WHY: Characterization test for bootstrapRunConfig (DB-first boot).
// Tests call order, return shape, and logger events.

function createSpyLogger() {
  const events = [];
  return {
    events,
    info(event, data) { events.push({ event, ...data }); },
    warn() {},
    error() {},
    flush: async () => {},
  };
}

function buildMinimalDeps() {
  const calls = [];

  const categoryConfig = {
    category: 'mouse',
    fieldOrder: ['brand', 'model'],
    requiredFields: ['brand'],
    fieldRules: { fields: {} },
    sourceHosts: [],
    sourceHostMap: new Map(),
    approvedRootDomains: new Set(),
  };
  const runtimeOverrides = { blocked_domains: ['spam.com'] };
  const billingSnapshot = { total: 0 };
  const llmRuntime = { llmContext: { model: 'flash-lite' } };
  const initialNeedSet = { fields: [{ state: 'missing' }], summary: {} };

  return {
    calls,
    deps: {
      loadPipelineBootConfigFn: ({ specDb, category: cat }) => {
        calls.push({ fn: 'loadPipelineBootConfig', category: cat });
        return categoryConfig;
      },
      readBillingSnapshotFn: (opts) => {
        calls.push({ fn: 'readBillingSnapshot', hasAppDb: opts.appDb !== undefined });
        return billingSnapshot;
      },
      createRunLlmRuntimeFn: (opts) => {
        calls.push({
          fn: 'createRunLlmRuntime',
          hasRuntimeOverrides: opts.runtimeOverrides === runtimeOverrides,
          hasBillingSnapshot: opts.billingSnapshot === billingSnapshot,
        });
        return llmRuntime;
      },
      normalizeCostRatesFn: () => ({}),
      appendCostLedgerEntryFn: () => {},
      recordPromptResultFn: () => {},
      defaultIndexLabRootFn: () => '/tmp/indexlab',
      joinPathFn: (...args) => args.join('/'),
      mkdirSyncFn: () => {},
      computeNeedSetFn: (opts) => {
        calls.push({ fn: 'computeNeedSet', category: opts.category, productId: opts.productId });
        return initialNeedSet;
      },
    },
    expected: { categoryConfig, runtimeOverrides, llmRuntime, initialNeedSet },
  };
}

function buildMinimalParams(logger, deps) {
  return {
    storage: { readJson: async () => ({}) },
    config: {},
    logger,
    category: 'mouse',
    productId: 'prod-1',
    runId: 'run-1',
    roundContext: null,
    runtimeMode: 'production',
    job: {
      productId: 'prod-1',
      category: 'mouse',
      identityLock: { brand: 'Razer', model: 'Viper' },
    },
    identityLock: { brand: 'Razer', model: 'Viper', base_model: 'Viper' },
    identityLockStatus: 'locked',
    runArtifactsBase: '/tmp/artifacts',
    syncRuntimeOverrides: async () => deps.expected.runtimeOverrides,
    frontierDb: null,
    specDb: null,
    deps: deps.deps,
  };
}

describe('bootstrapRunConfig characterization', () => {
  test('calls deps in correct order', async () => {
    const logger = createSpyLogger();
    const stubDeps = buildMinimalDeps();
    await bootstrapRunConfig(buildMinimalParams(logger, stubDeps));

    const order = stubDeps.calls.map((c) => c.fn);
    assert.strictEqual(order[0], 'loadPipelineBootConfig');
    assert.ok(order.indexOf('readBillingSnapshot') < order.indexOf('createRunLlmRuntime'));
    assert.ok(order.indexOf('createRunLlmRuntime') < order.indexOf('computeNeedSet'));
    assert.strictEqual(order.length, 4);
  });

  test('createRunLlmRuntime receives runtime overrides and billing snapshot', async () => {
    const logger = createSpyLogger();
    const stubDeps = buildMinimalDeps();
    await bootstrapRunConfig(buildMinimalParams(logger, stubDeps));

    const llmCall = stubDeps.calls.find((c) => c.fn === 'createRunLlmRuntime');
    assert.strictEqual(llmCall.hasRuntimeOverrides, true);
    assert.strictEqual(llmCall.hasBillingSnapshot, true);
  });

  test('returns expected shape', async () => {
    const logger = createSpyLogger();
    const stubDeps = buildMinimalDeps();
    const result = await bootstrapRunConfig(buildMinimalParams(logger, stubDeps));

    assert.ok(result.categoryConfig);
    assert.ok(result.runtimeOverrides);
    assert.ok(result.llmContext);
    assert.ok(result.initialNeedSet);
    assert.ok(result.blockedHosts instanceof Set);
    assert.ok(Array.isArray(result.requiredFields));
  });

  test('emits bootstrap_step events in order', async () => {
    const logger = createSpyLogger();
    const stubDeps = buildMinimalDeps();
    await bootstrapRunConfig(buildMinimalParams(logger, stubDeps));

    const steps = logger.events
      .filter((e) => e.event === 'bootstrap_step')
      .map((e) => ({ step: e.step, progress: e.progress }));

    assert.deepStrictEqual(steps, [
      { step: 'config', progress: 0 },
      { step: 'billing', progress: 40 },
      { step: 'llm', progress: 65 },
      { step: 'needset', progress: 85 },
    ]);
  });

  test('emits needset_computed with scope initial', async () => {
    const logger = createSpyLogger();
    const stubDeps = buildMinimalDeps();
    await bootstrapRunConfig(buildMinimalParams(logger, stubDeps));

    const needsetEvents = logger.events.filter((e) => e.event === 'needset_computed');
    assert.ok(needsetEvents.length >= 1);
    assert.strictEqual(needsetEvents[0].scope, 'initial');
    assert.strictEqual(needsetEvents[0].productId, 'prod-1');
  });
});
