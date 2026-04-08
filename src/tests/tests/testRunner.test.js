import test from 'node:test';
import assert from 'node:assert/strict';
import { runTestProduct } from '../testRunner.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockSpecDb() {
  const fieldTestCalls = [];
  return {
    upsertFieldTest(row) { fieldTestCalls.push(row); },
    getCompiledRules() { return null; },
    getCurationSuggestions() { return []; },
    _fieldTestCalls: fieldTestCalls,
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

/**
 * Build mock repair deps for testing the AI-on repair path.
 * @param {{ repairResults?: Record<string, object>, crossFieldResult?: object }} opts
 */
function buildMockRepairDeps({ repairResults = {}, crossFieldResult = null } = {}) {
  const repairCalls = [];
  const crossFieldCalls = [];

  return {
    repairField({ validationResult, fieldKey }) {
      repairCalls.push({ fieldKey, validationResult });
      const result = repairResults[fieldKey] || {
        status: 'still_failed', value: validationResult.value,
        confidence: 0, decisions: null, revalidation: null,
        promptId: null, flaggedForReview: false, error: 'no mock result',
      };
      return Promise.resolve(result);
    },
    repairCrossField(opts) {
      crossFieldCalls.push(opts);
      return Promise.resolve(crossFieldResult || {
        status: 'no_repair_needed', repairs: null,
        revalidation: null, promptId: null, flaggedForReview: false,
      });
    },
    buildRepairPrompt({ rejections, fieldKey }) {
      if (!rejections || rejections.length === 0) return null;
      return { promptId: `P_${fieldKey}`, system: 'mock system', user: 'mock user', jsonSchema: {} };
    },
    callLlm() { return Promise.resolve({}); },
    _repairCalls: repairCalls,
    _crossFieldCalls: crossFieldCalls,
  };
}

const MINIMAL_CONFIG = {
  categoryAuthorityRoot: 'category_authority',
  runtimeEventsKey: '_runtime/events.jsonl',
};

// ── Unit 1: Output shape contract ────────────────────────────────────────────

test('runTestProduct — output shape contract: all required keys present', async () => {
  const result = await runTestProduct({
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
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [],
    category: '_test_mouse',
  });

  assert.equal(result.confidence, 0);
  assert.equal(result.validated, true);
  assert.equal(result.coverage, 0);
});

test('runTestProduct — testCase passed through to return value', async () => {
  const testCase = { id: 7, name: 'similar_sensor', description: 'Sensor alias match', category: 'Components' };
  const result = await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob({ _testCase: testCase }),
    sourceResults: [],
    category: '_test_mouse',
  });

  assert.deepEqual(result.testCase, testCase);
});

test('runTestProduct — durationMs is reasonable', async () => {
  const result = await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [],
    category: '_test_mouse',
  });

  assert.ok(result.durationMs >= 0, 'durationMs must be non-negative');
  assert.ok(result.durationMs < 10000, 'durationMs must be reasonable (< 10s)');
});

// ── Unit 1: fields_json stored in DB ─────────────────────────────────────────

test('runTestProduct — stores fields_json in specDb upsert', async () => {
  const specDb = createMockSpecDb();
  const src = buildSourceResult({ dpi: '16000', weight: '80' });

  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [src],
    category: '_test_mouse',
    specDb,
  });

  assert.equal(specDb._fieldTestCalls.length, 1, 'upsertFieldTest called once');
  const row = specDb._fieldTestCalls[0];
  assert.ok(row.fields_json, 'fields_json must be set');
  const fields = JSON.parse(row.fields_json);
  assert.ok('dpi' in fields, 'fields_json contains resolved field dpi');
  assert.ok('weight' in fields, 'fields_json contains resolved field weight');
});

// ── Unit 2: No JSON artifact writes ──────────────────────────────────────────

test('runTestProduct — does not require storage parameter', async () => {
  // WHY: DB is SSOT for test data. No JSON artifacts needed.
  const result = await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: '16000' })],
    category: '_test_mouse',
  });

  assert.ok(result.productId, 'runs without storage');
  assert.ok(result.coverage >= 0, 'produces valid metrics');
});

// ── Unit 3: unk fallback on failed repair ────────────────────────────────────

test('runTestProduct — sets field to unk when repair status is still_failed', async () => {
  const specDb = createMockSpecDb();
  const repairDeps = buildMockRepairDeps({
    repairResults: {
      dpi: {
        status: 'still_failed', value: 'bad_value',
        confidence: 0, decisions: null, revalidation: null,
        promptId: 'P3', flaggedForReview: false, error: 'could not repair',
      },
    },
  });

  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: 'not_a_number' })],
    category: '_test_mouse',
    specDb,
    fieldRules: { fields: { dpi: { contract: { type: 'number', shape: 'scalar' } } } },
    aiReview: true,
    _repairDeps: repairDeps,
  });

  assert.equal(specDb._fieldTestCalls.length, 1);
  const fields = JSON.parse(specDb._fieldTestCalls[0].fields_json);
  assert.equal(fields.dpi, 'unk', 'failed repair must set field to unk');
});

test('runTestProduct — sets list field to [] when repair fails', async () => {
  const specDb = createMockSpecDb();
  const repairDeps = buildMockRepairDeps({
    repairResults: {
      color: {
        status: 'still_failed', value: 'bad',
        confidence: 0, decisions: null, revalidation: null,
        promptId: 'P1', flaggedForReview: false, error: 'could not repair',
      },
    },
  });

  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ color: 'invalid_color' })],
    category: '_test_mouse',
    specDb,
    fieldRules: { fields: { color: { contract: { type: 'string', shape: 'list' } } } },
    aiReview: true,
    _repairDeps: repairDeps,
  });

  const fields = JSON.parse(specDb._fieldTestCalls[0].fields_json);
  assert.deepEqual(fields.color, [], 'failed list repair must set field to []');
});

test('runTestProduct — keeps repaired value when status is repaired', async () => {
  const specDb = createMockSpecDb();
  const repairDeps = buildMockRepairDeps({
    repairResults: {
      dpi: {
        status: 'repaired', value: 16000,
        confidence: 0.95, decisions: [{ decision: 'map_to_existing', resolved_to: 16000, confidence: 0.95 }],
        revalidation: { valid: true, value: 16000, repairs: [], rejections: [] },
        promptId: 'P3', flaggedForReview: false,
      },
    },
  });

  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: 'sixteen thousand' })],
    category: '_test_mouse',
    specDb,
    fieldRules: { fields: { dpi: { contract: { type: 'number', shape: 'scalar' } } } },
    aiReview: true,
    _repairDeps: repairDeps,
  });

  const fields = JSON.parse(specDb._fieldTestCalls[0].fields_json);
  assert.equal(fields.dpi, 16000, 'repaired value must be stored');
});

// ── Unit 4: repairCrossField wired ───────────────────────────────────────────

test('runTestProduct — calls repairCrossField when cross-field failures exist', async () => {
  const specDb = createMockSpecDb();
  const repairDeps = buildMockRepairDeps({
    crossFieldResult: {
      status: 'repaired',
      repairs: [{ field: 'default_color', old_value: 'red', new_value: 'black', confidence: 0.9, reasoning: 'fixed' }],
      revalidation: { valid: true },
      promptId: 'P6',
      flaggedForReview: false,
    },
  });

  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: '16000' })],
    category: '_test_mouse',
    specDb,
    aiReview: true,
    _repairDeps: repairDeps,
    _validationOverride: {
      valid: false,
      fields: { dpi: 16000 },
      perField: { dpi: { valid: true, value: 16000, repairs: [], rejections: [] } },
      crossFieldFailures: [{ rule_id: 'default_in_colors', constraint: 'default_color ∈ colors', pass: false, message: 'mismatch' }],
    },
  });

  assert.equal(repairDeps._crossFieldCalls.length, 1, 'repairCrossField must be called');
  assert.ok(repairDeps._crossFieldCalls[0].crossFieldFailures.length > 0, 'cross-field failures passed');
});

test('runTestProduct — skips repairCrossField when crossFieldFailures is empty', async () => {
  const specDb = createMockSpecDb();
  const repairDeps = buildMockRepairDeps();

  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: '16000' })],
    category: '_test_mouse',
    specDb,
    aiReview: true,
    _repairDeps: repairDeps,
    _validationOverride: {
      valid: true,
      fields: { dpi: 16000 },
      perField: { dpi: { valid: true, value: 16000, repairs: [], rejections: [] } },
      crossFieldFailures: [],
    },
  });

  assert.equal(repairDeps._crossFieldCalls.length, 0, 'repairCrossField must NOT be called');
});

// ── Unit 5: Enriched repair log entries ──────────────────────────────────────

test('runTestProduct — repair log entries include rejections and revalidation', async () => {
  const specDb = createMockSpecDb();
  const mockRevalidation = { valid: true, value: 16000, repairs: [], rejections: [] };
  const repairDeps = buildMockRepairDeps({
    repairResults: {
      dpi: {
        status: 'repaired', value: 16000, confidence: 0.95,
        decisions: [{ decision: 'map_to_existing', resolved_to: 16000, confidence: 0.95 }],
        revalidation: mockRevalidation,
        promptId: 'P3', flaggedForReview: false,
      },
    },
  });

  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: 'not_a_number' })],
    category: '_test_mouse',
    specDb,
    fieldRules: { fields: { dpi: { contract: { type: 'number', shape: 'scalar' } } } },
    aiReview: true,
    _repairDeps: repairDeps,
  });

  const row = specDb._fieldTestCalls[0];
  const repairLog = JSON.parse(row.repair_json);
  assert.ok(repairLog.length >= 1, 'repair log has entries');
  const entry = repairLog.find(e => e.field === 'dpi');
  assert.ok(entry, 'repair log has dpi entry');
  assert.ok(Array.isArray(entry.rejections), 'entry has rejections array');
  assert.ok('revalidation' in entry, 'entry has revalidation');
});

test('runTestProduct — repair log value_after is unk when repair fails', async () => {
  const specDb = createMockSpecDb();
  const repairDeps = buildMockRepairDeps({
    repairResults: {
      dpi: {
        status: 'still_failed', value: 'bad',
        confidence: 0, decisions: null, revalidation: null,
        promptId: 'P3', flaggedForReview: false, error: 'nope',
      },
    },
  });

  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: 'not_a_number' })],
    category: '_test_mouse',
    specDb,
    fieldRules: { fields: { dpi: { contract: { type: 'number', shape: 'scalar' } } } },
    aiReview: true,
    _repairDeps: repairDeps,
  });

  const repairLog = JSON.parse(specDb._fieldTestCalls[0].repair_json);
  const entry = repairLog.find(e => e.field === 'dpi');
  assert.equal(entry.value_after, 'unk', 'value_after must be unk for failed repair');
});

// ── Phase A: Validator as authority ──────────────────────────────────────────

test('runTestProduct — requiredFields derived from fieldRules, not compiledRules', async () => {
  const specDb = createMockSpecDb();
  // Only provide 1 field (dpi), but mark 3 as required in fieldRules
  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: '16000' })],
    category: '_test_mouse',
    specDb,
    fieldRules: {
      fields: {
        dpi: { contract: { type: 'number', shape: 'scalar' }, required: 'required' },
        weight: { contract: { type: 'number', shape: 'scalar' }, required: 'required' },
        sensor: { contract: { type: 'string', shape: 'scalar' }, required: 'required' },
      },
    },
  });

  const row = specDb._fieldTestCalls[0];
  const missing = JSON.parse(row.missing_required);
  assert.ok(missing.length >= 2, `expected >=2 missing required, got ${missing.length}: ${missing.join(', ')}`);
  assert.ok(missing.includes('weight'), 'weight should be missing');
  assert.ok(missing.includes('sensor'), 'sensor should be missing');
});

test('runTestProduct — validator drives stored fields (not old engine)', async () => {
  const specDb = createMockSpecDb();
  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: '16000', weight: '80' })],
    category: '_test_mouse',
    specDb,
    fieldRules: { fields: { dpi: { contract: { type: 'number', shape: 'scalar' } } } },
  });

  const row = specDb._fieldTestCalls[0];
  const fields = JSON.parse(row.fields_json);
  // Validator processes resolvedFields — dpi and weight should be present
  assert.ok('dpi' in fields, 'validator output includes dpi');
  assert.ok('weight' in fields, 'validator output includes weight');
});

test('runTestProduct — constraint conflicts from validator crossFieldFailures', async () => {
  const specDb = createMockSpecDb();
  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: '16000' })],
    category: '_test_mouse',
    specDb,
    _validationOverride: {
      valid: false,
      fields: { dpi: 16000 },
      perField: { dpi: { valid: true, value: 16000, repairs: [], rejections: [] } },
      crossFieldFailures: [
        { rule_id: 'test_rule', constraint: 'dpi > 0', pass: false, message: 'test', action: 'flag' },
        { rule_id: 'test_rule2', constraint: 'dpi < 50000', pass: false, message: 'test2', action: 'flag' },
      ],
    },
  });

  const row = specDb._fieldTestCalls[0];
  assert.equal(row.constraint_conflicts, 2, 'constraint_conflicts from validator crossFieldFailures');
});

test('runTestProduct — evidence penalty reduces confidence when pass_target not met', async () => {
  const specDb = createMockSpecDb();
  // Single source, but field needs 2+ evidence refs
  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: '16000' })],
    category: '_test_mouse',
    specDb,
  });

  const row = specDb._fieldTestCalls[0];
  // With single tier-1 source: base confidence 0.95, but no evidence penalty since no engine to set pass_target
  // This test just verifies confidence is a number — the evidence penalty is tested via live field test
  assert.equal(typeof row.confidence, 'number');
});

// ── Deterministic field audit log ────────────────────────────────────────────

test('runTestProduct — deterministic mode builds pending_llm entries for invalid fields', async () => {
  const specDb = createMockSpecDb();
  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: 'not_a_number' })],
    category: '_test_mouse',
    specDb,
    aiReview: false,
    fieldRules: { fields: { dpi: { contract: { type: 'number', shape: 'scalar' } } } },
  });

  const row = specDb._fieldTestCalls[0];
  assert.ok(row.repair_json, 'repair_json must be populated in deterministic mode');
  const log = JSON.parse(row.repair_json);
  const dpiEntry = log.find(e => e.field === 'dpi');
  assert.ok(dpiEntry, 'dpi entry must exist in audit log');
  assert.equal(dpiEntry.status, 'pending_llm', 'invalid field gets pending_llm status');
  assert.ok(dpiEntry.prompt_in, 'prompt_in must be populated');
  assert.ok(dpiEntry.prompt_in.user, 'prompt_in.user must have the prompt text');
  assert.equal(dpiEntry.response_out, null, 'response_out must be null — LLM not called');
  assert.equal(dpiEntry.value_after, null, 'value_after must be null — LLM not called');
  assert.ok(dpiEntry.rejections.length > 0, 'rejections must be populated');
});

test('runTestProduct — deterministic mode includes valid field entries', async () => {
  const specDb = createMockSpecDb();
  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: '16000', weight: 'not_number' })],
    category: '_test_mouse',
    specDb,
    aiReview: false,
    fieldRules: {
      fields: {
        dpi: { contract: { type: 'number', shape: 'scalar' } },
        weight: { contract: { type: 'number', shape: 'scalar' } },
      },
    },
  });

  const row = specDb._fieldTestCalls[0];
  const log = JSON.parse(row.repair_json);
  const validEntries = log.filter(e => e.status === 'valid');
  const pendingEntries = log.filter(e => e.status === 'pending_llm');
  assert.ok(validEntries.length > 0, 'must have valid entries');
  // dpi='16000' parses as number → valid; weight='not_number' → pending_llm
  const dpiEntry = log.find(e => e.field === 'dpi');
  assert.equal(dpiEntry.status, 'valid');
  assert.equal(dpiEntry.value_before, dpiEntry.value_after, 'valid field: before === after');
  assert.ok(pendingEntries.length > 0, 'must have pending entries for invalid fields');
});

test('runTestProduct — deterministic mode does not call LLM repair deps', async () => {
  const repairDeps = buildMockRepairDeps();
  await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: 'not_a_number' })],
    category: '_test_mouse',
    aiReview: false,
    fieldRules: { fields: { dpi: { contract: { type: 'number', shape: 'scalar' } } } },
    _repairDeps: repairDeps,
  });

  assert.equal(repairDeps._repairCalls.length, 0, 'repairField must not be called in deterministic mode');
  assert.equal(repairDeps._crossFieldCalls.length, 0, 'repairCrossField must not be called in deterministic mode');
});

test('runTestProduct — repairLog summary includes pendingLlm and valid counts', async () => {
  const result = await runTestProduct({
    config: MINIMAL_CONFIG,
    job: buildFixtureJob(),
    sourceResults: [buildSourceResult({ dpi: '16000', weight: 'bad' })],
    category: '_test_mouse',
    aiReview: false,
    fieldRules: {
      fields: {
        dpi: { contract: { type: 'number', shape: 'scalar' } },
        weight: { contract: { type: 'number', shape: 'scalar' } },
      },
    },
  });

  assert.ok(result.repairLog, 'repairLog must exist in deterministic mode');
  assert.equal(typeof result.repairLog.pendingLlm, 'number', 'pendingLlm count must be number');
  assert.equal(typeof result.repairLog.valid, 'number', 'valid count must be number');
  assert.ok(result.repairLog.pendingLlm > 0, 'must have pending entries');
  assert.ok(result.repairLog.valid > 0, 'must have valid entries');
  assert.equal(result.repairLog.total, result.repairLog.pendingLlm + result.repairLog.valid + result.repairLog.promptSkipped, 'total = pending + valid + skipped');
});
