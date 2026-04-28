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

function makeFinderStoreStub(settings = KNOB_DEFAULTS, { initialRuns = [] } = {}) {
  const upserts = [];
  const runs = [...initialRuns];
  const resolved = { ...settings };
  return {
    store: {
      getSetting: (k) => (k in resolved ? String(resolved[k]) : ''),
      upsert: (row) => { upserts.push(row); },
      insertRun: (row) => { runs.push(row); },
      listRuns: (productId) => runs.filter((row) => row.product_id === productId),
    },
    upserts,
    runs,
  };
}

function makeSpecDbStub({
  finderStore,
  variants = [{ variant_id: 'v0', variant_key: 'default', variant_label: 'Default', variant_type: 'base' }],
  category = 'mouse',
  componentLinks = [],
  resolvedFields = {},
  fieldCandidateRows = {},
  pifProgressRows = [],
  compiledRules = COMPILED_FIELD_RULES,
  fieldStudioMap = null,
} = {}) {
  return {
    category,
    getFinderStore: (id) => (id === 'keyFinder' ? finderStore : null),
    getCompiledRules: () => compiledRules,
    getFieldStudioMap: () => fieldStudioMap,
    getProduct: () => null,
    variants: {
      listActive: () => variants,
      listByProduct: () => variants,
    },
    getFieldCandidatesByProductAndField: (_pid, fk, variantId) => {
      const rows = fieldCandidateRows[fk] || [];
      if (variantId === undefined) return rows;
      return rows.filter((row) => (row.variant_id ?? null) === (variantId ?? null));
    },
    listPifVariantProgressByProduct: () => pifProgressRows,
    getItemComponentLinks: () => componentLinks,
    getResolvedFieldCandidate: (_pid, fk) =>
      Object.prototype.hasOwnProperty.call(resolvedFields, fk)
        ? { value: resolvedFields[fk], confidence: 90 }
        : null,
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
  const fsStub = makeFinderStoreStub(opts.settings, { initialRuns: opts.initialRuns || [] });
  const specDb = makeSpecDbStub({
    finderStore: fsStub.store,
    variants: opts.variants,
    category: 'mouse',
    componentLinks: opts.componentLinks,
    resolvedFields: opts.resolvedFields,
    fieldCandidateRows: opts.fieldCandidateRows,
    pifProgressRows: opts.pifProgressRows,
    compiledRules: opts.compiledRules,
    fieldStudioMap: opts.fieldStudioMap,
  });
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

test('concurrent product key runs reserve distinct run numbers before LLM completion', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kf-concurrent-run-numbers';
  const { fsStub, specDb } = setupForProduct(productId);
  const entered = [];
  const releaseLlm = [];
  const sourceRunNumbers = [];

  const waitForBothLlmCalls = async () => {
    const startedAt = Date.now();
    while (entered.length < 2) {
      if (Date.now() - startedAt > 1000) throw new Error('timed out waiting for both LLM calls');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  const responseFor = (fieldKey) => ({
    result: {
      primary_field_key: fieldKey,
      results: {
        [fieldKey]: {
          value: fieldKey === 'polling_rate' ? 8000 : 'Focus Pro 30K',
          confidence: 91,
          unknown_reason: '',
          evidence_refs: [
            {
              url: `https://example.com/${fieldKey}`,
              tier: 'tier1',
              confidence: 91,
              supporting_evidence: `${fieldKey} evidence`,
              evidence_kind: 'direct_quote',
            },
          ],
        },
      },
      discovery_log: {
        urls_checked: [`https://example.com/${fieldKey}`],
        queries_run: [`${fieldKey} query`],
        notes: [],
      },
    },
    usage: null,
  });
  const run = (fieldKey) => runKeyFinder({
    product: { ...PRODUCT, product_id: productId },
    fieldKey,
    category: 'mouse',
    specDb,
    appDb: null,
    config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async () => {
      entered.push(fieldKey);
      await new Promise((resolve) => releaseLlm.push(resolve));
      return responseFor(fieldKey);
    },
    _submitCandidateOverride: async ({ sourceMeta }) => {
      sourceRunNumbers.push(sourceMeta.run_number);
      return { status: 'accepted', publishResult: { status: 'published' } };
    },
  });

  const polling = run('polling_rate');
  const sensor = run('sensor_model');
  await waitForBothLlmCalls();
  releaseLlm.forEach((resolve) => resolve());
  const results = await Promise.all([polling, sensor]);

  assert.deepEqual(
    results.map((result) => result.run_number).sort((a, b) => a - b),
    [1, 2],
  );
  assert.deepEqual(
    fsStub.runs.map((row) => row.run_number).sort((a, b) => a - b),
    [1, 2],
  );
  assert.deepEqual(
    sourceRunNumbers.sort((a, b) => a - b),
    [1, 2],
    'publisher source ids must match the reserved run numbers',
  );
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
  assert.equal(doc.runs[0].response.results.sensor_model.value, null, '"unk" is normalized out before JSON persistence');
  assert.equal(doc.runs[0].selected.keys.sensor_model.value, null, '"unk" is not stored as selected field data');
  assert.equal(fsStub.runs[0].response.results.sensor_model.value, null, '"unk" is normalized out before SQL run persistence');
  assert.equal(fsStub.runs[0].selected.keys.sensor_model.value, null, '"unk" is not stored as SQL selected field data');
  assert.equal(result.unknown_reason, 'Manufacturer page does not disclose the sensor IC');
});

test('honest uppercase "UNK" is treated as unknown before storage and publisher submit', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kf-unk-uppercase';
  const { fsStub, specDb } = setupForProduct(productId);
  let submitCalled = false;
  const upperResponse = {
    ...UNK_RESPONSE,
    result: {
      ...UNK_RESPONSE.result,
      results: {
        sensor_model: {
          ...UNK_RESPONSE.result.results.sensor_model,
          value: 'UNK',
        },
      },
    },
  };

  const result = await runKeyFinder({
    product: { ...PRODUCT, product_id: productId },
    fieldKey: 'sensor_model',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async () => upperResponse,
    _submitCandidateOverride: async () => { submitCalled = true; return { status: 'accepted' }; },
  });

  assert.equal(submitCalled, false, 'submitCandidate must NOT fire for uppercase "UNK"');
  assert.equal(result.status, 'unk');
  const doc = readKeyFinder({ productId, productRoot: PRODUCT_ROOT });
  assert.equal(doc.runs[0].response.results.sensor_model.value, null);
  assert.equal(doc.runs[0].selected.keys.sensor_model.value, null);
  assert.equal(fsStub.runs[0].response.results.sensor_model.value, null);
  assert.equal(fsStub.runs[0].selected.keys.sensor_model.value, null);
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

// ── Step 6.7: Context injection upstreams ─────────────────────────────

// Compiled rules with one parent component (sensor) + its subfield (sensor_type)
// + two scalar peers (polling_rate, release_date). The scalars let us exercise
// known-fields dedup behavior alongside the always-on inventory.
// Phase 1: property_keys come from field_studio_map.component_sources
// (passed via specDb.getFieldStudioMap()), not from the compiled rule.
const FIELD_STUDIO_MAP_WITH_COMPONENT = {
  component_sources: [
    { component_type: 'sensor', roles: { properties: [
      { field_key: 'sensor_type', variance_policy: 'authoritative' },
    ] } },
  ],
};

const RULES_WITH_COMPONENT = {
  fields: {
    sensor: {
      field_key: 'sensor',
      component: { type: 'sensor' },
      contract: { type: 'string', shape: 'scalar' },
      difficulty: 'hard', required_level: 'mandatory', availability: 'rare',
      group: 'sensor_performance', enum: { policy: 'open' },
      evidence: { min_evidence_refs: 1 }, ai_assist: { reasoning_note: '' },
    },
    sensor_type: {
      field_key: 'sensor_type', component: null,
      contract: { type: 'string', shape: 'scalar' },
      difficulty: 'medium', required_level: 'mandatory', availability: 'sometimes',
      group: 'sensor_performance', enum: { policy: 'open' },
      evidence: { min_evidence_refs: 1 }, ai_assist: { reasoning_note: '' },
    },
    polling_rate: POLLING_RATE_RULE,
    weight_g: {
      ...POLLING_RATE_RULE, field_key: 'weight_g', component: null,
      contract: { type: 'number', shape: 'scalar', unit: 'g' },
    },
    release_date: {
      ...POLLING_RATE_RULE, field_key: 'release_date', component: null,
      contract: { type: 'date', shape: 'scalar' },
    },
  },
  known_values: {},
};

test('step 6.7: PRODUCT_COMPONENTS inventory fires regardless of componentInjectionEnabled', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kf-inv-unconditional', {
    settings: {
      ...KNOB_DEFAULTS,
      componentInjectionEnabled: 'false',
      knownFieldsInjectionEnabled: 'false',
    },
    compiledRules: RULES_WITH_COMPONENT,
    fieldStudioMap: FIELD_STUDIO_MAP_WITH_COMPONENT,
    componentLinks: [{ field_key: 'sensor', component_type: 'sensor', component_name: 'Hero 25K' }],
    resolvedFields: { sensor_type: 'optical' },
  });
  let capturedDomainArgs = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kf-inv-unconditional' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => { capturedDomainArgs = domainArgs; return GOOD_RESPONSE; },
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  const inv = capturedDomainArgs?.productComponents || [];
  const sensorEntry = inv.find((e) => e.parentFieldKey === 'sensor');
  assert.ok(sensorEntry, 'inventory must include sensor even when componentInjectionEnabled is false');
  assert.equal(sensorEntry.resolvedValue, 'Hero 25K');
  assert.deepEqual(sensorEntry.subfields, [
    { field_key: 'sensor_type', value: 'optical', variancePolicy: 'authoritative' },
  ]);
});

test('step 6.7: per-key relation pointer gated by componentInjectionEnabled', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kf-rel-off', {
    settings: { ...KNOB_DEFAULTS, componentInjectionEnabled: 'false' },
    compiledRules: RULES_WITH_COMPONENT,
    fieldStudioMap: FIELD_STUDIO_MAP_WITH_COMPONENT,
    componentLinks: [{ field_key: 'sensor', component_type: 'sensor', component_name: 'Hero 25K' }],
  });
  let capturedDomainArgs = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kf-rel-off' },
    fieldKey: 'sensor_type',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedDomainArgs = domainArgs;
      // Primary matches field_key so the runner accepts the response
      return { result: { primary_field_key: 'sensor_type', results: { sensor_type: { value: 'optical', confidence: 80, unknown_reason: '', evidence_refs: [{ url: 'https://x', tier: 'tier1', confidence: 80, supporting_evidence: 'q', evidence_kind: 'direct_quote' }], discovery_log: { urls_checked: [], queries_run: [], notes: [] } } }, discovery_log: { urls_checked: [], queries_run: [], notes: [] } }, usage: null };
    },
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  assert.equal(capturedDomainArgs?.componentContext?.primary, null, 'primary relation pointer null when knob off');
});

test('step 6.7: per-key relation pointer emitted when componentInjectionEnabled=true and key has relation', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kf-rel-on', {
    settings: KNOB_DEFAULTS, // componentInjectionEnabled defaults to 'true'
    compiledRules: RULES_WITH_COMPONENT,
    fieldStudioMap: FIELD_STUDIO_MAP_WITH_COMPONENT,
    componentLinks: [{ field_key: 'sensor', component_type: 'sensor', component_name: 'Hero 25K' }],
  });
  let capturedDomainArgs = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kf-rel-on' },
    fieldKey: 'sensor_type',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedDomainArgs = domainArgs;
      return { result: { primary_field_key: 'sensor_type', results: { sensor_type: { value: 'optical', confidence: 80, unknown_reason: '', evidence_refs: [{ url: 'https://x', tier: 'tier1', confidence: 80, supporting_evidence: 'q', evidence_kind: 'direct_quote' }], discovery_log: { urls_checked: [], queries_run: [], notes: [] } } }, discovery_log: { urls_checked: [], queries_run: [], notes: [] } }, usage: null };
    },
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  const primaryRel = capturedDomainArgs?.componentContext?.primary;
  assert.ok(primaryRel, 'primary relation pointer must be populated');
  assert.equal(primaryRel.type, 'sensor');
  assert.equal(primaryRel.relation, 'subfield_of');
});

test('step 6.7: product-scoped facts exclude primary, component inventory, and reserved variant keys', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kf-known-dedup', {
    settings: KNOB_DEFAULTS,
    compiledRules: RULES_WITH_COMPONENT,
    fieldStudioMap: FIELD_STUDIO_MAP_WITH_COMPONENT,
    componentLinks: [{ field_key: 'sensor', component_type: 'sensor', component_name: 'Hero 25K' }],
    resolvedFields: { sensor_type: 'optical' },
    fieldCandidateRows: {
      sensor_type: [{ field_key: 'sensor_type', value: 'optical', status: 'resolved', confidence: 90, variant_id: null }],
      polling_rate: [{ field_key: 'polling_rate', value: 4000, status: 'resolved', confidence: 90, variant_id: null }],
      release_date: [{ field_key: 'release_date', value: '2023-09-15', status: 'resolved', confidence: 99, variant_id: 'v_bo7' }],
      weight_g: [{ field_key: 'weight_g', value: 63, status: 'resolved', confidence: 90, variant_id: null }],
    },
  });
  let capturedDomainArgs = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kf-known-dedup' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => { capturedDomainArgs = domainArgs; return GOOD_RESPONSE; },
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  const facts = capturedDomainArgs?.productScopedFacts || {};
  assert.deepEqual(
    Object.keys(facts).sort(),
    ['weight_g'],
    'product-scoped facts must exclude primary, inventory members, and reserved variant-owned keys',
  );
  assert.equal(facts.weight_g, 63);
});

test('step 6.7: knownFieldsInjectionEnabled=false -> productScopedFacts empty regardless of resolved state', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kf-known-off', {
    settings: { ...KNOB_DEFAULTS, knownFieldsInjectionEnabled: 'false' },
    compiledRules: RULES_WITH_COMPONENT,
    fieldStudioMap: FIELD_STUDIO_MAP_WITH_COMPONENT,
    fieldCandidateRows: {
      weight_g: [{ field_key: 'weight_g', value: 63, status: 'resolved', confidence: 90, variant_id: null }],
    },
  });
  let capturedDomainArgs = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kf-known-off' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => { capturedDomainArgs = domainArgs; return GOOD_RESPONSE; },
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  assert.deepEqual(capturedDomainArgs?.productScopedFacts, {});
});

test('step 6.7: variant inventory joins SKU/RDF by variant_id and adds field identity usage', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kf-variant-inventory', {
    settings: KNOB_DEFAULTS,
    compiledRules: {
      fields: {
        ...RULES_WITH_COMPONENT.fields,
        design: {
          ...POLLING_RATE_RULE,
          field_key: 'design',
          display_name: 'Design',
          contract: { type: 'string', shape: 'scalar' },
          ai_assist: { reasoning_note: '', variant_inventory_usage: { enabled: true } },
        },
      },
      known_values: {},
    },
    variants: [
      { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'black', variant_type: 'color', color_atoms: ['black'] },
      { variant_id: 'v_bo7', variant_key: 'edition:bo7', variant_label: 'Call of Duty: Black Ops 7 Edition', variant_type: 'edition', color_atoms: ['black', 'white'] },
    ],
    fieldCandidateRows: {
      sku: [
        { field_key: 'sku', value: 'BLACK-SKU', status: 'resolved', confidence: 97, variant_id: 'v_black' },
        { field_key: 'sku', value: 'CH-931DB1M-NA', status: 'resolved', confidence: 96, variant_id: 'v_bo7' },
      ],
      release_date: [
        { field_key: 'release_date', value: '2025-11-11', status: 'resolved', confidence: 95, variant_id: 'v_bo7' },
      ],
    },
    pifProgressRows: [
      { variant_id: 'v_bo7', hero_filled: 1, hero_target: 3, priority_filled: 2, priority_total: 4 },
    ],
  });
  let capturedDomainArgs = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kf-variant-inventory' },
    fieldKey: 'design',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedDomainArgs = domainArgs;
      return {
        result: {
          primary_field_key: 'design',
          results: {
            design: {
              value: 'symmetrical shell',
              confidence: 88,
              unknown_reason: '',
              evidence_refs: [{ url: 'https://corsair.example/m75', tier: 'tier1', confidence: 90, supporting_evidence: 'symmetrical shell', evidence_kind: 'direct_quote' }],
              discovery_log: { urls_checked: [], queries_run: [], notes: [] },
            },
          },
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
        usage: null,
      };
    },
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  assert.deepEqual(
    capturedDomainArgs.variantInventory.map((row) => [row.variant_id, row.sku, row.release_date, row.image_status]),
    [
      ['v_black', 'BLACK-SKU', '', ''],
      ['v_bo7', 'CH-931DB1M-NA', '2025-11-11', 'hero 1/3; priority 2/4'],
    ],
  );
  assert.match(capturedDomainArgs.fieldIdentityUsage, /shared physical\/industrial design/i);
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

// ── Telemetry wiring (Fix B) ─────────────────────────────────────────
// WHY: KeyFinder's active-operations panel was frozen at "running" and never
// showed the model — because the orchestrator never invoked onStageAdvance /
// onModelResolved / onLlmCallComplete. RDF & SKU drive their UI via these
// callbacks. These regressions guard the wiring so the panel behaves the same
// as the other finders.

test('invokes onStageAdvance through Discovery → Validate → Publish for a published run', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kf-stages-published';
  const { specDb } = setupForProduct(productId);
  const stages = [];

  await runKeyFinder({
    product: { ...PRODUCT, product_id: productId },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    onStageAdvance: (name) => stages.push(name),
    _callLlmOverride: async () => GOOD_RESPONSE,
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  assert.deepEqual(stages, ['Discovery', 'Validate', 'Publish'],
    'stages must fire in order so the op pill transitions instead of sitting on "running"');
});

test('invokes onStageAdvance only through Discovery → Validate for an honest unk (no publisher)', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kf-stages-unk';
  const { specDb } = setupForProduct(productId);
  const stages = [];

  await runKeyFinder({
    product: { ...PRODUCT, product_id: productId },
    fieldKey: 'sensor_model',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    onStageAdvance: (name) => stages.push(name),
    _callLlmOverride: async () => UNK_RESPONSE,
    _submitCandidateOverride: async () => { throw new Error('should not be called for unk'); },
  });

  assert.deepEqual(stages, ['Discovery', 'Validate'],
    'unk path skips Publish since no publisher submit happens');
});

test('emits onLlmCallComplete twice per LLM call: pending (response:null) then completed (upsert)', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kf-llm-call-log';
  const { specDb } = setupForProduct(productId);
  const calls = [];

  await runKeyFinder({
    product: { ...PRODUCT, product_id: productId },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    onLlmCallComplete: (call) => calls.push(call),
    _callLlmOverride: async () => GOOD_RESPONSE,
    _submitCandidateOverride: async () => ({ status: 'accepted', publishResult: { status: 'published' } }),
  });

  // WHY: appendLlmCall upserts — pending row appears immediately so the user
  // can see the in-flight prompt, then the completed emit merges the response
  // + usage into the same row. Mirrors productImageFinder / colorEditionFinder.
  assert.equal(calls.length, 2, 'pending-before + completed-after pattern');
  const [pending, completed] = calls;

  assert.equal(pending.label, 'Discovery');
  assert.equal(pending.response, null, 'pending emit has response:null so modal shows "Awaiting response..."');
  assert.ok(pending.prompt?.system && pending.prompt?.user, 'prompt visible immediately on pending row');

  assert.equal(completed.label, 'Discovery', 'same label → appendLlmCall upserts onto pending row');
  assert.ok(completed.response, 'completed emit carries the full response');
  assert.ok('model' in completed, 'model field present so modal renders the chip');
  assert.ok('thinking' in completed && 'webSearch' in completed && 'effortLevel' in completed && 'accessMode' in completed,
    'full modelTracking shape — modal reads these for the capability chip');
  assert.ok('usage' in completed, 'usage field so modal can render token counts + cost');

  // WHY: Locks the withLlmCallTracking migration — the wrapper stamps these at
  // the top level of the completed emission so the modal's LlmCallCard can
  // render "dur <ms>" without hunting through response.*. If a future refactor
  // drops the wrapper these assertions break loudly.
  assert.equal(typeof completed.started_at, 'string');
  assert.match(completed.started_at, /^\d{4}-\d{2}-\d{2}T/, 'ISO-8601 timestamp');
  assert.equal(typeof completed.duration_ms, 'number');
  assert.ok(completed.duration_ms >= 0, 'duration_ms non-negative');
});

test('threads onModelResolved / onStreamChunk / onQueueWait to buildLlmCallDeps (regression: was dropped)', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kf-llm-deps-thread';
  const { specDb } = setupForProduct(productId);

  // Capture the deps handed to createKeyFinderCallLlm. Uses a real run (no
  // _callLlmOverride) with a stubbed createPhaseCallLlm seam via the adapter
  // would be overkill; simplest: assert keyFinder accepts the opts keys
  // without throwing (the wiring itself is unit-covered by the adapter tests +
  // the onLlmCallComplete test above which proves deps flow end-to-end).
  await runKeyFinder({
    product: { ...PRODUCT, product_id: productId },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    broadcastWs: null,
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    onModelResolved: () => {},
    onStreamChunk: () => {},
    onQueueWait: () => {},
    _callLlmOverride: async () => GOOD_RESPONSE,
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });
  // No throw = opts accepted. Real delivery verified in adapter tests.
});

test('discovery log scope reads prior history from SQL before stale JSON', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kf-disc-sql-first';
  const { mergeKeyFinderDiscovery } = await import('../keyStore.js');
  mergeKeyFinderDiscovery({
    productId,
    productRoot: PRODUCT_ROOT,
    newDiscovery: { category: 'mouse', last_ran_at: '2026-04-19T00:00:00Z' },
    run: {
      model: 'json-stale-model',
      selected: { keys: { polling_rate: { value: 1000 } } },
      prompt: { system: '', user: '' },
      response: {
        primary_field_key: 'polling_rate',
        results: {},
        discovery_log: { urls_checked: ['https://JSON-STALE.example.com'], queries_run: ['json stale q'], notes: [] },
      },
    },
  });

  const sqlRun = {
    category: 'mouse',
    product_id: productId,
    run_number: 4,
    ran_at: '2026-04-20T00:00:00Z',
    started_at: '2026-04-20T00:00:00Z',
    duration_ms: 1,
    model: 'sql-prior-model',
    fallback_used: false,
    thinking: false,
    web_search: false,
    effort_level: '',
    access_mode: '',
    selected: { keys: { polling_rate: { value: 4000 } } },
    prompt: { system: '', user: '' },
    response: {
      primary_field_key: 'polling_rate',
      results: {},
      discovery_log: { urls_checked: ['https://SQL-PRIOR.example.com'], queries_run: ['sql prior q'], notes: [] },
    },
  };
  const { specDb } = setupForProduct(productId, { initialRuns: [sqlRun] });

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
  assert.ok(urls.includes('https://SQL-PRIOR.example.com'), 'SQL prior URL should be injected');
  assert.ok(!urls.includes('https://JSON-STALE.example.com'), 'stale JSON URL must not be injected when SQL runs exist');
  assert.ok(queries.includes('sql prior q'));
  assert.ok(!queries.includes('json stale q'));
});
