import test from 'node:test';
import assert from 'node:assert/strict';
import { runTestProduct } from '../testRunner.js';

function createMockStorage() {
  return {
    resolveOutputKey(...parts) { return parts.filter(Boolean).join('/'); },
    writeObject() { return Promise.resolve(); },
    readJsonOrNull() { return Promise.resolve(null); },
  };
}

function buildFixtureJob(overrides = {}) {
  return {
    productId: '_test_mouse-testco-scenario-01',
    category: '_test_mouse',
    identityLock: { brand: 'TestCo', base_model: 'TestModel', model: 'TestModel happy_path', variant: 'happy_path' },
    _testCase: { id: 1, name: 'happy_path', description: 'All fields', category: 'Coverage' },
    ...overrides,
  };
}

const MINIMAL_CONFIG = {
  categoryAuthorityRoot: 'category_authority',
  runtimeEventsKey: '_runtime/events.jsonl',
};

test('runTestProduct — output shape contract: all required keys present', async () => {
  const result = await runTestProduct({
    storage: createMockStorage(),
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [],
    category: '_test_mouse',
  });

  assert.ok(result.productId, 'must have productId');
  assert.ok(result.runId, 'must have runId');
  assert.equal(typeof result.confidence, 'number');
  assert.equal(typeof result.coverage, 'number');
  assert.equal(typeof result.completeness, 'number');
  assert.equal(typeof result.validated, 'boolean');
  assert.ok(typeof result.trafficLight === 'object');
  assert.equal(typeof result.constraintConflicts, 'number');
  assert.ok(Array.isArray(result.missingRequired));
  assert.equal(typeof result.curationSuggestions, 'number');
  assert.equal(typeof result.runtimeFailures, 'number');
  assert.equal(typeof result.durationMs, 'number');
});

test('runTestProduct — stub returns no field data (validation stage not wired)', async () => {
  const result = await runTestProduct({
    storage: createMockStorage(),
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [],
    category: '_test_mouse',
  });

  // WHY: No consensus engine — stub returns zero confidence, no validation
  assert.equal(result.confidence, 0);
  assert.equal(result.validated, false);
  assert.equal(result.coverage, 0);
  assert.equal(result.completeness, 0);
});

test('runTestProduct — testCase passed through to return value', async () => {
  const testCase = { id: 7, name: 'similar_sensor', description: 'Sensor alias match', category: 'Components' };
  const result = await runTestProduct({
    storage: createMockStorage(),
    config: MINIMAL_CONFIG,
    job: buildFixtureJob({ _testCase: testCase }),
    sourceResults: [],
    category: '_test_mouse',
  });

  assert.deepEqual(result.testCase, testCase);
});

test('runTestProduct — no files written to latest/', async () => {
  const written = new Map();
  const storage = {
    ...createMockStorage(),
    writeObject(key, buf) { written.set(key, buf); return Promise.resolve(); },
  };

  await runTestProduct({
    storage,
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [],
    category: '_test_mouse',
  });

  assert.equal(written.size, 0, 'stub should not write any files');
});
