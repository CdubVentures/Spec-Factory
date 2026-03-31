import test from 'node:test';
import assert from 'node:assert/strict';
import { runTestProduct } from '../testRunner.js';

// --- In-memory storage mock ---
function createMockStorage() {
  const written = new Map();
  return {
    written,
    resolveOutputKey(...parts) {
      return parts.filter(Boolean).join('/');
    },
    writeObject(key, buf, _opts) {
      written.set(key, JSON.parse(buf.toString('utf8')));
      return Promise.resolve();
    },
    readJsonOrNull() { return Promise.resolve(null); },
  };
}

// --- Fixture: minimal source result ---
function buildFixtureSource({ host, tier, role, fieldCandidates }) {
  return {
    url: `https://${host}/products/test`,
    finalUrl: `https://${host}/products/test`,
    host,
    rootDomain: host,
    tier,
    tierName: role,
    role,
    ts: '2026-01-01T00:00:00.000Z',
    status: 200,
    identity: { match: true, score: 1.0 },
    identityCandidates: { brand: 'TestCo', model: 'TestModel', variant: '' },
    fieldCandidates: fieldCandidates.map((c, i) => ({
      field: c.field,
      value: String(c.value),
      method: 'html_table',
      keyPath: `specs.${c.field}`,
      evidenceRefs: [`ev_${i}`],
      snippetId: `ev_${i}`,
      snippetHash: '',
      quote: `${c.field}: ${c.value}`,
      quoteSpan: null,
      llm_extract_model: 'deterministic',
      llm_extract_provider: 'test',
    })),
    anchorCheck: { conflicts: [], majorConflicts: [] },
    anchorStatus: 'pass',
    approvedDomain: true,
    llmEvidencePack: null,
    fingerprint: null,
    parserHealth: { health_score: 1.0 },
  };
}

function buildFixtureSources(fieldOrder) {
  const candidates = fieldOrder.map((f) => ({ field: f, value: f === 'weight' ? '80' : `val_${f}` }));
  return [
    buildFixtureSource({ host: 'src1.example.com', tier: 1, role: 'manufacturer', fieldCandidates: candidates }),
    buildFixtureSource({ host: 'src2.example.com', tier: 1, role: 'manufacturer', fieldCandidates: candidates }),
    buildFixtureSource({ host: 'src3.example.com', tier: 2, role: 'review', fieldCandidates: candidates }),
  ];
}

// --- Fixture: minimal job ---
function buildFixtureJob(overrides = {}) {
  return {
    productId: '_test_mouse-testco-scenario-01',
    category: '_test_mouse',
    identityLock: { brand: 'TestCo', model: 'TestModel', variant: 'happy_path' },
    _testCase: { id: 1, name: 'happy_path', description: 'All fields', category: 'Coverage' },
    ...overrides,
  };
}

const FIELD_ORDER = ['weight', 'dpi', 'sensor', 'connection', 'polling_rate'];

// --- Minimal config (no field rules engine path → graceful fallback) ---
const MINIMAL_CONFIG = {
  categoryAuthorityRoot: 'category_authority',
  runtimeEventsKey: '_runtime/events.jsonl',
};

// ============================================================
// Test matrix: characterization + contract tests
// ============================================================

test('runTestProduct — output shape contract: all required keys present', async () => {
  const storage = createMockStorage();
  const result = await runTestProduct({
    storage,
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: buildFixtureSources(FIELD_ORDER),
    category: '_test_mouse',
  });

  // Return value shape
  assert.ok(result.productId, 'must have productId');
  assert.ok(result.runId, 'must have runId');
  assert.ok(result.testCase, 'must have testCase');
  assert.equal(typeof result.confidence, 'number', 'confidence must be number');
  assert.equal(typeof result.coverage, 'number', 'coverage must be number');
  assert.equal(typeof result.completeness, 'number', 'completeness must be number');
  assert.equal(typeof result.validated, 'boolean', 'validated must be boolean');
  assert.ok(result.trafficLight && typeof result.trafficLight === 'object', 'trafficLight must be object');
  assert.equal(typeof result.constraintConflicts, 'number', 'constraintConflicts must be number');
  assert.ok(Array.isArray(result.missingRequired), 'missingRequired must be array');
  assert.equal(typeof result.curationSuggestions, 'number', 'curationSuggestions must be number');
  assert.equal(typeof result.runtimeFailures, 'number', 'runtimeFailures must be number');
  assert.equal(typeof result.durationMs, 'number', 'durationMs must be number');
});

test('runTestProduct — artifacts written: 4 files to latest/', async () => {
  const storage = createMockStorage();
  await runTestProduct({
    storage,
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: buildFixtureSources(FIELD_ORDER),
    category: '_test_mouse',
  });

  const pid = '_test_mouse-testco-scenario-01';
  const latestBase = `_test_mouse/${pid}/latest`;

  const normalizedKey = `${latestBase}/normalized.json`;
  const provenanceKey = `${latestBase}/provenance.json`;
  const summaryKey = `${latestBase}/summary.json`;
  const candidatesKey = `${latestBase}/candidates.json`;

  assert.ok(storage.written.has(normalizedKey), `missing ${normalizedKey}`);
  assert.ok(storage.written.has(provenanceKey), `missing ${provenanceKey}`);
  assert.ok(storage.written.has(summaryKey), `missing ${summaryKey}`);
  assert.ok(storage.written.has(candidatesKey), `missing ${candidatesKey}`);

  // Normalized must have identity + fields
  const norm = storage.written.get(normalizedKey);
  assert.ok(norm.identity, 'normalized must have identity');
  assert.ok(norm.fields && typeof norm.fields === 'object', 'normalized must have fields');
});

test('runTestProduct — summary compact shape has all keys buildValidationChecks reads', async () => {
  const storage = createMockStorage();
  await runTestProduct({
    storage,
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: buildFixtureSources(FIELD_ORDER),
    category: '_test_mouse',
  });

  const pid = '_test_mouse-testco-scenario-01';
  const summary = storage.written.get(`_test_mouse/${pid}/latest/summary.json`);

  assert.equal(typeof summary.confidence, 'number', 'summary.confidence');
  assert.ok('field_reasoning' in summary, 'summary.field_reasoning');
  assert.ok('runtime_engine' in summary, 'summary.runtime_engine');
  assert.ok('coverage_overall_percent' in summary, 'summary.coverage_overall_percent');
  assert.ok('fields_below_pass_target' in summary, 'summary.fields_below_pass_target');
  assert.ok('missing_required_fields' in summary, 'summary.missing_required_fields');
  assert.ok('constraint_analysis' in summary, 'summary.constraint_analysis');
  assert.ok('productId' in summary, 'summary.productId');
  assert.ok('runId' in summary, 'summary.runId');
});

test('runTestProduct — test mode invariants: unpublishable + test profile', async () => {
  const storage = createMockStorage();
  await runTestProduct({
    storage,
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: buildFixtureSources(FIELD_ORDER),
    category: '_test_mouse',
  });

  const pid = '_test_mouse-testco-scenario-01';
  const summary = storage.written.get(`_test_mouse/${pid}/latest/summary.json`);

  assert.equal(summary.publishable, false, 'test mode must be unpublishable');
  assert.ok(
    Array.isArray(summary.publish_blockers) && summary.publish_blockers.includes('test_mode'),
    'publish_blockers must include test_mode'
  );
});

test('runTestProduct — happy path: 3 agreeing sources produce non-zero confidence', async () => {
  const storage = createMockStorage();
  const result = await runTestProduct({
    storage,
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: buildFixtureSources(FIELD_ORDER),
    category: '_test_mouse',
  });

  // WHY: confidence is always >= 0.5 in test mode because identityConfidence = 1 (0.5 weight)
  assert.ok(result.confidence >= 0.5, `confidence should be >= 0.5, got ${result.confidence}`);
  assert.equal(typeof result.coverage, 'number', 'coverage must be number');
});

test('runTestProduct — empty sourceResults: baseline confidence from identity only', async () => {
  const storage = createMockStorage();
  const result = await runTestProduct({
    storage,
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [],
    category: '_test_mouse',
  });

  // WHY: identityConfidence=1 contributes 0.5, provenance=0, agreement=0 → confidence=0.5
  assert.equal(result.confidence, 0.5, 'confidence should be 0.5 (identity only)');
  assert.equal(typeof result.coverage, 'number', 'coverage must be number');
});

test('runTestProduct — runtime engine failure is non-fatal: still produces result', async () => {
  const storage = createMockStorage();
  // WHY: createFieldRulesEngine may fail for test categories lacking rule files.
  // loadCategoryConfig must succeed (category must exist), but engine failure is tolerated.
  const result = await runTestProduct({
    storage,
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: buildFixtureSources(FIELD_ORDER),
    category: '_test_mouse',
  });

  // Should produce output regardless of engine state
  assert.ok(result.productId, 'should still produce result');
  assert.equal(typeof result.confidence, 'number', 'should still have confidence');
  assert.equal(typeof result.runtimeFailures, 'number', 'should report runtime failures');
});

test('runTestProduct — testCase passed through to return value', async () => {
  const testCase = { id: 7, name: 'similar_sensor', description: 'Sensor alias match', category: 'Components' };
  const storage = createMockStorage();
  const result = await runTestProduct({
    storage,
    config: MINIMAL_CONFIG,
    job: buildFixtureJob({ _testCase: testCase }),
    sourceResults: buildFixtureSources(FIELD_ORDER),
    category: '_test_mouse',
  });

  assert.deepEqual(result.testCase, testCase);
});
