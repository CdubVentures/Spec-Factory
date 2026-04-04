import test from 'node:test';
import assert from 'node:assert/strict';

import { createPipelineCommands } from '../pipelineCommands.js';

// WHY: Characterization tests lock current commandIndexLab behavior before
// we modify it to support DB-first job resolution via jobOverride.

function createMockStorage(overrides = {}) {
  const written = [];
  const jsonStore = new Map();
  return {
    written,
    jsonStore,
    readJson: async (key) => {
      if (jsonStore.has(key)) return jsonStore.get(key);
      throw new Error(`not_found: ${key}`);
    },
    writeObject: async (key, body) => {
      const parsed = JSON.parse(body.toString('utf8'));
      written.push({ key, parsed });
      jsonStore.set(key, parsed);
    },
    resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
    ...overrides,
  };
}

function createMockRunProduct(overrides = {}) {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts);
    return {
      productId: opts.jobOverride?.productId || 'mock-pid',
      runId: 'mock-run-id',
      startMs: Date.now(),
      crawlResults: [],
      summary: { validated: false, confidence: 0 },
      exportInfo: {},
      job: opts.jobOverride || { identityLock: {} },
      ...overrides,
    };
  };
  fn.calls = calls;
  return fn;
}

function buildDeps(mockRunProduct, mockRunUntilComplete) {
  return {
    asBool: (v) => ['1', 'true', 'yes'].includes(String(v || '').toLowerCase()),
    toPosixKey: (...parts) => parts.filter(Boolean).join('/'),
    runProduct: mockRunProduct,
    runUntilComplete: mockRunUntilComplete || (async () => ({})),
    IndexLabRuntimeBridge: class {
      constructor() { this.needSet = null; this.searchProfile = null; }
      set onEvent(_fn) {}
      broadcastScreencastFrame() {}
      onRuntimeEvent() {}
      setContext() {}
      async finalize() {}
    },
    defaultIndexLabRoot: () => '/tmp/indexlab',
  };
}

function makeConfig() {
  return {
    runtimeScreencastEnabled: false,
  };
}

test('commandIndexLab characterization: existing fixture file is read via s3Key', async () => {
  const existingJob = {
    productId: 'mouse-abc12345',
    category: 'mouse',
    identityLock: { brand: 'Razer', base_model: 'Viper V3 Pro', model: 'Viper V3 Pro', variant: '' },
    seedUrls: [],
  };
  const storage = createMockStorage();
  storage.jsonStore.set('specs/inputs/mouse/products/mouse-abc12345.json', existingJob);

  const mockRun = createMockRunProduct();
  const { commandIndexLab } = createPipelineCommands(buildDeps(mockRun));

  await commandIndexLab(makeConfig(), storage, {
    category: 'mouse',
    'product-id': 'mouse-abc12345',
    'run-id': 'test-run-001',
  });

  assert.equal(mockRun.calls.length, 1, 'runProduct called once');
  const call = mockRun.calls[0];
  assert.equal(call.s3Key, 'specs/inputs/mouse/products/mouse-abc12345.json');
  // WHY: jobOverride is falsy (null) — runProduct falls through to fixture read.
  // Before DB-first wiring this was undefined; now it's null from failed DB lookup.
  // Observable behavior is identical: fixture file is still read.
  assert.ok(!call.jobOverride, 'jobOverride is falsy — fixture read path used');
});

test('commandIndexLab characterization: --brand/--model creates fixture with those values', async () => {
  const storage = createMockStorage();
  const mockRun = createMockRunProduct();
  const { commandIndexLab } = createPipelineCommands(buildDeps(mockRun));

  await commandIndexLab(makeConfig(), storage, {
    category: 'mouse',
    brand: 'Logitech',
    model: 'G502 X Plus',
    'run-id': 'test-run-002',
  });

  assert.equal(storage.written.length, 1, 'one fixture written');
  const written = storage.written[0];
  assert.equal(written.parsed.identityLock.brand, 'Logitech');
  assert.equal(written.parsed.identityLock.base_model, 'G502 X Plus');
  assert.equal(written.parsed.identityLock.model, 'G502 X Plus');
  assert.ok(written.key.startsWith('specs/inputs/mouse/products/'));
});

test('commandIndexLab characterization: no args creates fixture with unknown defaults', async () => {
  const storage = createMockStorage();
  const mockRun = createMockRunProduct();
  const { commandIndexLab } = createPipelineCommands(buildDeps(mockRun));

  await commandIndexLab(makeConfig(), storage, {
    category: 'mouse',
    'run-id': 'test-run-003',
  });

  assert.equal(storage.written.length, 1, 'one fixture written');
  const written = storage.written[0];
  assert.equal(written.parsed.identityLock.brand, 'unknown');
  assert.equal(written.parsed.identityLock.base_model, 'unknown-model');
  assert.equal(written.parsed.identityLock.model, 'unknown-model');
});

test('commandIndexLab characterization: --seed "Razer Viper V3 Pro" parses brand/model', async () => {
  const storage = createMockStorage();
  const mockRun = createMockRunProduct();
  const { commandIndexLab } = createPipelineCommands(buildDeps(mockRun));

  await commandIndexLab(makeConfig(), storage, {
    category: 'mouse',
    seed: 'Razer Viper V3 Pro',
    'run-id': 'test-run-004',
  });

  assert.equal(storage.written.length, 1, 'one fixture written');
  const written = storage.written[0];
  assert.equal(written.parsed.identityLock.brand, 'Razer');
  assert.equal(written.parsed.identityLock.base_model, 'Viper V3 Pro');
  assert.equal(written.parsed.identityLock.model, 'Viper V3 Pro');
});

test('commandIndexLab characterization: --seed URL is used as s3Key directly (contains /)', async () => {
  // WHY: Current behavior — if seed contains '/', it's treated as an s3Key path,
  // not as a seed URL. No fixture is created; the URL is passed as s3Key to runProduct.
  const seedUrl = 'https://rtings.com/mouse/reviews/razer/viper-v3-pro';
  const storage = createMockStorage();
  // Pre-load so readJson doesn't throw when runProduct tries to load it
  storage.jsonStore.set(seedUrl, { productId: 'mock', category: 'mouse', identityLock: {} });
  const mockRun = createMockRunProduct();
  const { commandIndexLab } = createPipelineCommands(buildDeps(mockRun));

  await commandIndexLab(makeConfig(), storage, {
    category: 'mouse',
    seed: seedUrl,
    'run-id': 'test-run-005',
  });

  assert.equal(storage.written.length, 0, 'no fixture written — URL used as s3Key');
  assert.equal(mockRun.calls.length, 1);
  assert.equal(mockRun.calls[0].s3Key, seedUrl);
});

test('commandIndexLab characterization: --fields populates requirements.requiredFields', async () => {
  const storage = createMockStorage();
  const mockRun = createMockRunProduct();
  const { commandIndexLab } = createPipelineCommands(buildDeps(mockRun));

  await commandIndexLab(makeConfig(), storage, {
    category: 'mouse',
    brand: 'Razer',
    model: 'Viper',
    fields: 'weight,dpi,sensor',
    'run-id': 'test-run-006',
  });

  const written = storage.written[0];
  assert.deepEqual(written.parsed.requirements, { requiredFields: ['weight', 'dpi', 'sensor'] });
});

// --- New behavior tests (DB-first job resolution) ---

test('commandIndexLab: --brand/--model builds jobOverride directly (no DB needed)', async () => {
  const storage = createMockStorage();
  const mockRun = createMockRunProduct();
  const { commandIndexLab } = createPipelineCommands(buildDeps(mockRun));

  await commandIndexLab(makeConfig(), storage, {
    category: 'mouse',
    brand: 'Corsair',
    model: 'M75 Air',
    variant: 'White',
    'product-id': 'mouse-test999',
    'run-id': 'test-run-010',
  });

  assert.equal(mockRun.calls.length, 1);
  const call = mockRun.calls[0];
  assert.ok(call.jobOverride, 'jobOverride should be set from CLI args');
  assert.equal(call.jobOverride.identityLock.brand, 'Corsair');
  assert.equal(call.jobOverride.identityLock.base_model, 'M75 Air');
  assert.equal(call.jobOverride.identityLock.model, 'M75 Air White');
  assert.equal(call.jobOverride.identityLock.variant, 'White');
  assert.equal(call.jobOverride.productId, 'mouse-test999');
});
