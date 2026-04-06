import test from 'node:test';
import assert from 'node:assert/strict';
import { runTestProduct } from '../testRunner.js';

function createMockStorage() {
  const written = new Map();
  return {
    resolveOutputKey(...parts) { return parts.filter(Boolean).join('/'); },
    writeObject(key, buf) { written.set(key, buf); return Promise.resolve(); },
    readJsonOrNull() { return Promise.resolve(null); },
    _written: written,
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

function buildSourceResult(fields = {}, tier = 1, tierName = 'manufacturer') {
  const candidates = Object.entries(fields).map(([field, value], i) => ({
    field,
    value: String(value),
    method: 'html_table',
    keyPath: `specs.${field}`,
    snippetId: `ev_s0_f${i}`,
    quote: `${field}: ${value}`,
  }));
  return {
    url: 'https://test.example.com/product',
    host: 'test.example.com',
    rootDomain: 'test.example.com',
    tier,
    tierName,
    fieldCandidates: candidates,
    llmEvidencePack: { meta: { source_id: 'src_0' }, snippets: [], references: [] },
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

test('runTestProduct — empty sourceResults: zero coverage, validated true', async () => {
  const result = await runTestProduct({
    storage: createMockStorage(),
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [],
    category: '_test_mouse',
  });

  // WHY: No candidates → no fields resolved → zero coverage, but still validated (pipeline ran)
  assert.equal(result.confidence, 0);
  assert.equal(result.validated, true);
  assert.equal(result.coverage, 0);
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

test('runTestProduct — writes normalized, summary, provenance to storage', async () => {
  const storage = createMockStorage();

  await runTestProduct({
    storage,
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [],
    category: '_test_mouse',
  });

  const keys = [...storage._written.keys()];
  assert.ok(keys.some(k => k.includes('normalized.json')), 'must write normalized.json');
  assert.ok(keys.some(k => k.includes('summary.json')), 'must write summary.json');
  assert.ok(keys.some(k => k.includes('provenance.json')), 'must write provenance.json');
});

test('runTestProduct — with source results: fields resolved and provenance populated', async () => {
  const storage = createMockStorage();
  const src = buildSourceResult({ dpi: '16000', weight: '80' });

  const result = await runTestProduct({
    storage,
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [src],
    category: '_test_mouse',
  });

  // Fields were resolved from candidates
  const summaryJson = storage._written.get('_test_mouse/_test_mouse-testco-scenario-01/latest/summary.json');
  assert.ok(summaryJson, 'summary must be written');
  const summary = JSON.parse(summaryJson);
  assert.ok(summary.productId, 'summary has productId');
  assert.ok(summary.runId, 'summary has runId');

  const provenanceJson = storage._written.get('_test_mouse/_test_mouse-testco-scenario-01/latest/provenance.json');
  assert.ok(provenanceJson, 'provenance must be written');
  const provenance = JSON.parse(provenanceJson);
  assert.ok(provenance.dpi, 'provenance has dpi field');
  assert.ok(provenance.dpi.evidence.length >= 1, 'dpi has evidence');
  assert.equal(provenance.dpi.evidence[0].tier, 1);

  const normalizedJson = storage._written.get('_test_mouse/_test_mouse-testco-scenario-01/latest/normalized.json');
  assert.ok(normalizedJson, 'normalized must be written');
  const normalized = JSON.parse(normalizedJson);
  assert.ok(normalized.fields.dpi !== undefined, 'normalized has dpi field');
});

test('runTestProduct — durationMs is reasonable', async () => {
  const result = await runTestProduct({
    storage: createMockStorage(),
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [],
    category: '_test_mouse',
  });

  assert.ok(result.durationMs >= 0, 'durationMs must be non-negative');
  assert.ok(result.durationMs < 10000, 'durationMs must be reasonable (< 10s)');
});
