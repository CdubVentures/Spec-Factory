import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runKeyFinder } from '../keyFinder.js';
import { readKeyFinder } from '../keyStore.js';

// ── Fixtures ───────────────────────────────────────────────────────────

const PRODUCT = {
  product_id: 'kf-test-001',
  category: 'mouse',
  brand: 'Razer',
  model: 'DeathAdder V3 Pro',
  base_model: 'DeathAdder V3 Pro',
  variant: '',
};

const POLLING_RATE_RULE = {
  field_key: 'polling_rate',
  display_name: 'Polling Rate',
  ui: { label: 'Polling Rate' },
  contract: { type: 'number', shape: 'scalar', unit: 'Hz' },
  aliases: ['report rate'],
  difficulty: 'medium',
  required_level: 'mandatory',
  availability: 'always',
  group: 'sensor_performance',
  enum: { policy: 'open' },
  evidence: { min_evidence_refs: 1 },
  ai_assist: { reasoning_note: 'Report native wireless polling rate.' },
};

const SENSOR_MODEL_RULE = {
  field_key: 'sensor_model',
  display_name: 'Sensor Model',
  contract: { type: 'string', shape: 'scalar' },
  difficulty: 'very_hard',
  required_level: 'mandatory',
  availability: 'rare',
  group: 'sensor_performance',
  enum: { policy: 'open' },
  evidence: { min_evidence_refs: 1 },
  ai_assist: { reasoning_note: '' },
};

const COMPILED_FIELD_RULES = {
  fields: {
    polling_rate: POLLING_RATE_RULE,
    sensor_model: SENSOR_MODEL_RULE,
  },
  known_values: {},
};

const POLICY = {
  keyFinderTiers: {
    easy: { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    medium: { model: 'gpt-5.4-mini', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
    hard: { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    very_hard: { model: 'gpt-5.4', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
    fallback: { model: 'gpt-5.4', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
  },
  models: { plan: 'gpt-5.4' },
};

const KNOB_DEFAULTS = {
  discoveryPromptTemplate: '',
  urlHistoryEnabled: 'true',
  queryHistoryEnabled: 'true',
  componentInjectionEnabled: 'true',
  knownFieldsInjectionEnabled: 'true',
  searchHintsInjectionEnabled: 'true',
  budgetRequiredPoints: JSON.stringify({ mandatory: 2, non_mandatory: 1 }),
  budgetAvailabilityPoints: JSON.stringify({ always: 1, sometimes: 2, rare: 3 }),
  budgetDifficultyPoints: JSON.stringify({ easy: 1, medium: 2, hard: 3, very_hard: 4 }),
  budgetVariantPointsPerExtra: '1',
  budgetFloor: '3',
};

const GOOD_RESPONSE = {
  result: {
    primary_field_key: 'polling_rate',
    results: {
      polling_rate: {
        value: 8000,
        confidence: 88,
        unknown_reason: '',
        evidence_refs: [
          { url: 'https://razer.com/deathadder', tier: 'tier1', confidence: 92, supporting_evidence: '8000 Hz native wireless polling', evidence_kind: 'direct_quote' },
        ],
        discovery_log: { urls_checked: ['https://razer.com/deathadder'], queries_run: ['deathadder polling rate'], notes: [] },
      },
    },
    discovery_log: { urls_checked: ['https://razer.com/deathadder'], queries_run: ['deathadder polling rate'], notes: [] },
  },
  usage: null,
};

const UNK_RESPONSE = {
  result: {
    primary_field_key: 'sensor_model',
    results: {
      sensor_model: {
        value: 'unk',
        confidence: 0,
        unknown_reason: 'Manufacturer page does not disclose the sensor IC',
        evidence_refs: [],
        discovery_log: { urls_checked: ['https://razer.com/deathadder'], queries_run: ['sensor teardown'], notes: [] },
      },
    },
    discovery_log: { urls_checked: [], queries_run: [], notes: [] },
  },
  usage: null,
};

// ── Stubs ──────────────────────────────────────────────────────────────

function makeFinderStoreStub(settings = KNOB_DEFAULTS) {
  const upserts = [];
  const runs = [];
  const resolved = { ...settings };
  return {
    store: {
      getSetting: (k) => (k in resolved ? String(resolved[k]) : ''),
      upsert: (row) => { upserts.push(row); },
      insertRun: (row) => { runs.push(row); },
      listSuppressions: () => [],
    },
    upserts,
    runs,
  };
}

function makeSpecDbStub({ finderStore, variants = [{ variant_id: 'v0', variant_key: 'default', variant_label: 'Default', variant_type: 'base' }], category = 'mouse' } = {}) {
  return {
    category,
    getFinderStore: (id) => (id === 'keyFinder' ? finderStore : null),
    getCompiledRules: () => COMPILED_FIELD_RULES,
    getProduct: () => null,
    variants: {
      listActive: () => variants,
      listByProduct: () => variants,
    },
    getFieldCandidatesByProductAndField: () => [],
  };
}

// ── Setup ──────────────────────────────────────────────────────────────

const TMP = path.join(os.tmpdir(), `kf-orch-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP, 'products');

function cleanupTmp() {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ }
}

function setupForProduct(productId, opts = {}) {
  const productDir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'product.json'), JSON.stringify({ product_id: productId, category: 'mouse', candidates: {}, fields: {} }));
  const fsStub = makeFinderStoreStub(opts.settings);
  const specDb = makeSpecDbStub({ finderStore: fsStub.store, variants: opts.variants, category: 'mouse' });
  return { fsStub, specDb };
}

// ── Tests ──────────────────────────────────────────────────────────────

test('reserved-key rejection short-circuits before any LLM / store write', async (t) => {
  t.after(cleanupTmp);
  const { fsStub, specDb } = setupForProduct('kf-reserved');
  let llmCalled = false;
  let submitCalled = false;

  await assert.rejects(
    () => runKeyFinder({
      product: { ...PRODUCT, product_id: 'kf-reserved' },
      fieldKey: 'release_date', // RDF owns this
      category: 'mouse',
      specDb, appDb: null, config: {},
      broadcastWs: null,
      productRoot: PRODUCT_ROOT,
      policy: POLICY,
      _callLlmOverride: async () => { llmCalled = true; return GOOD_RESPONSE; },
      _submitCandidateOverride: async () => { submitCalled = true; return { status: 'accepted' }; },
    }),
    /reserved/i,
  );

  assert.equal(llmCalled, false, 'LLM must not be invoked for reserved field keys');
  assert.equal(submitCalled, false);
  assert.equal(fsStub.runs.length, 0, 'no SQL run should be inserted');
});

test('missing field rule throws with identifying message; no LLM call', async (t) => {
  t.after(cleanupTmp);
  const { fsStub, specDb } = setupForProduct('kf-missing');
  let llmCalled = false;

  await assert.rejects(
    () => runKeyFinder({
      product: { ...PRODUCT, product_id: 'kf-missing' },
      fieldKey: 'does_not_exist',
      category: 'mouse',
      specDb, appDb: null, config: {},
      broadcastWs: null,
      productRoot: PRODUCT_ROOT,
      policy: POLICY,
      _callLlmOverride: async () => { llmCalled = true; return GOOD_RESPONSE; },
    }),
    /does_not_exist|field rule/i,
  );

  assert.equal(llmCalled, false);
  assert.equal(fsStub.runs.length, 0);
});

test('tier dispatch — medium difficulty resolves medium tier bundle; modelOverride emitted', async (t) => {
  t.after(cleanupTmp);
  const { fsStub, specDb } = setupForProduct('kf-tier-medium');
  const captured = [];

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kf-tier-medium' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs, mapped) => {
      captured.push({ domainArgs, mapped });
      return GOOD_RESPONSE;
    },
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  assert.equal(captured.length, 1, 'LLM called exactly once');
  assert.equal(captured[0].mapped?.reason, 'key_finding_medium');
  assert.equal(captured[0].mapped?.modelOverride, 'gpt-5.4-mini');
});

test('tier dispatch — very_hard difficulty resolves very_hard bundle', async (t) => {
  t.after(cleanupTmp);
  const { fsStub, specDb } = setupForProduct('kf-tier-very-hard');
  const captured = [];

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kf-tier-very-hard' },
    fieldKey: 'sensor_model',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs, mapped) => {
      captured.push({ mapped });
      return UNK_RESPONSE;
    },
    _submitCandidateOverride: async () => { throw new Error('should not be called for unk'); },
  });

  assert.equal(captured[0].mapped?.reason, 'key_finding_very_hard');
  assert.equal(captured[0].mapped?.modelOverride, 'gpt-5.4');
});

test('tier dispatch — empty tier cascades to fallback bundle', async (t) => {
  t.after(cleanupTmp);
  const { fsStub, specDb } = setupForProduct('kf-tier-fallback');
  const captured = [];
  // 'easy' is empty in the fixture → fallback (gpt-5.4) applies
  const easyRule = { ...POLLING_RATE_RULE, difficulty: 'easy' };
  specDb.getCompiledRules = () => ({ fields: { polling_rate: easyRule }, known_values: {} });

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kf-tier-fallback' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (_d, mapped) => { captured.push({ mapped }); return { result: { ...GOOD_RESPONSE.result, primary_field_key: 'polling_rate' }, usage: null }; },
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  assert.equal(captured[0].mapped?.reason, 'key_finding_easy');
  // fallback bundle has model gpt-5.4 — inherited because easy tier is empty
  assert.equal(captured[0].mapped?.modelOverride, 'gpt-5.4');
});

test('prompt is solo-shape — no passenger sections, primary contract block present', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kf-prompt-solo');
  let capturedSystem = '';

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kf-prompt-solo' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      // Capture the system prompt the orchestrator built. We rebuild it here
      // from domainArgs — mirrors how createPhaseCallLlm does it.
      const { buildKeyFinderPrompt } = await import('../keyLlmAdapter.js');
      capturedSystem = buildKeyFinderPrompt(domainArgs);
      return GOOD_RESPONSE;
    },
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  // Primary contract block is present — type + unit
  assert.match(capturedSystem, /Polling Rate|polling_rate/);
  assert.match(capturedSystem, /Hz/);
  // No passenger sections should render
  assert.doesNotMatch(capturedSystem, /Passenger key:/);
  assert.doesNotMatch(capturedSystem, /Additional key guidance:/);
});

test('discovery log scope — runMatcher filters by primary_field_key', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kf-disc-scope';
  const { fsStub, specDb } = setupForProduct(productId);

  // Seed two prior runs in JSON: one for polling_rate (match), one for sensor_model (no match)
  const { mergeKeyFinderDiscovery } = await import('../keyStore.js');
  mergeKeyFinderDiscovery({
    productId, productRoot: PRODUCT_ROOT,
    newDiscovery: { category: 'mouse', last_ran_at: '2026-04-20T00:00:00Z' },
    run: {
      model: 'gpt-5.4-mini', started_at: '2026-04-20T00:00:00Z', duration_ms: 1,
      selected: { keys: { polling_rate: { value: 4000 } } },
      prompt: { system: '', user: '' },
      response: {
        primary_field_key: 'polling_rate',
        results: {},
        discovery_log: { urls_checked: ['https://PRIOR-PR.example.com'], queries_run: ['prior pr q'], notes: [] },
      },
    },
  });
  mergeKeyFinderDiscovery({
    productId, productRoot: PRODUCT_ROOT,
    newDiscovery: { category: 'mouse', last_ran_at: '2026-04-20T00:01:00Z' },
    run: {
      model: 'gpt-5.4', started_at: '2026-04-20T00:01:00Z', duration_ms: 1,
      selected: { keys: { sensor_model: { value: 'unk' } } },
      prompt: { system: '', user: '' },
      response: {
        primary_field_key: 'sensor_model',
        results: {},
        discovery_log: { urls_checked: ['https://OTHER-SM.example.com'], queries_run: ['other sm q'], notes: [] },
      },
    },
  });

  let capturedDomainArgs = null;
  await runKeyFinder({
    product: { ...PRODUCT, product_id: productId },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => { capturedDomainArgs = domainArgs; return GOOD_RESPONSE; },
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  const urls = capturedDomainArgs?.previousDiscovery?.urlsChecked || [];
  const queries = capturedDomainArgs?.previousDiscovery?.queriesRun || [];
  assert.ok(urls.includes('https://PRIOR-PR.example.com'), 'prior polling_rate URL should be injected');
  assert.ok(!urls.includes('https://OTHER-SM.example.com'), 'sensor_model URL must not leak into polling_rate scope');
  assert.ok(queries.includes('prior pr q'));
  assert.ok(!queries.includes('other sm q'));
});

test('non-"unk" submission — submitCandidate called once with variantId:null + correct sourceMeta', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kf-submit-ok');
  const submitCalls = [];

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kf-submit-ok' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: { componentDb: null }, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async () => GOOD_RESPONSE,
    _submitCandidateOverride: async (args) => {
      submitCalls.push(args);
      return { status: 'accepted', publishResult: { status: 'published' } };
    },
  });

  assert.equal(submitCalls.length, 1);
  const call = submitCalls[0];
  assert.equal(call.fieldKey, 'polling_rate');
  assert.equal(call.value, 8000);
  assert.equal(call.confidence, 88);
  assert.equal(call.variantId, null);
  assert.equal(call.productId, 'kf-submit-ok');
  assert.equal(call.category, 'mouse');
  assert.equal(call.sourceMeta.source, 'key_finder');
  assert.equal(call.sourceMeta.tier, 'medium');
  assert.equal(call.sourceMeta.model, 'gpt-5.4-mini');
  assert.ok(Array.isArray(call.metadata.evidence_refs));
  assert.equal(call.metadata.evidence_refs.length, 1);
});

test('honest "unk" — submitCandidate NOT called; run still persists', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kf-unk';
  const { fsStub, specDb } = setupForProduct(productId);
  let submitCalled = false;

  const result = await runKeyFinder({
    product: { ...PRODUCT, product_id: productId },
    fieldKey: 'sensor_model',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async () => UNK_RESPONSE,
    _submitCandidateOverride: async () => { submitCalled = true; return { status: 'accepted' }; },
  });

  assert.equal(submitCalled, false, 'submitCandidate must NOT fire for "unk"');
  assert.equal(result.status, 'unk');
  assert.equal(fsStub.runs.length, 1, 'SQL run still inserted for an honest unk');
  const doc = readKeyFinder({ productId, productRoot: PRODUCT_ROOT });
  assert.equal(doc.runs.length, 1);
  assert.equal(doc.runs[0].response.primary_field_key, 'sensor_model');
});

test('run record round-trips — response.primary_field_key echoed; SQL insertRun called with matching payload', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kf-roundtrip';
  const { fsStub, specDb } = setupForProduct(productId);

  await runKeyFinder({
    product: { ...PRODUCT, product_id: productId },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async () => GOOD_RESPONSE,
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  // JSON side
  const doc = readKeyFinder({ productId, productRoot: PRODUCT_ROOT });
  assert.equal(doc.runs.length, 1);
  assert.equal(doc.runs[0].response.primary_field_key, 'polling_rate', 'primary_field_key must be echoed on the run for future runMatcher');
  assert.equal(doc.runs[0].selected.keys.polling_rate.value, 8000);

  // SQL side
  assert.equal(fsStub.runs.length, 1);
  const sqlRun = fsStub.runs[0];
  assert.equal(sqlRun.product_id, productId);
  assert.equal(sqlRun.category, 'mouse');
  assert.equal(sqlRun.run_number, 1);
  assert.ok(sqlRun.ran_at);
  assert.equal(sqlRun.model, 'gpt-5.4-mini');
  assert.equal(sqlRun.response.primary_field_key, 'polling_rate');
  assert.ok(sqlRun.selected.keys.polling_rate);
  assert.ok(sqlRun.prompt.system);
});

test('publisher error is non-fatal — run persists; error surfaced on return', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kf-pub-fail';
  const { fsStub, specDb } = setupForProduct(productId);

  const result = await runKeyFinder({
    product: { ...PRODUCT, product_id: productId },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async () => GOOD_RESPONSE,
    _submitCandidateOverride: async () => { throw new Error('publisher boom'); },
  });

  assert.equal(fsStub.runs.length, 1, 'run still persisted despite publisher error');
  const doc = readKeyFinder({ productId, productRoot: PRODUCT_ROOT });
  assert.equal(doc.runs.length, 1);
  assert.equal(result.publisher_error, 'publisher boom');
  assert.equal(result.status, 'accepted'); // value was defensible; only publisher gate failed
});
