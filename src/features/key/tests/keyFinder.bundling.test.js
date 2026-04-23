/**
 * runKeyFinder bundling integration — orchestrator-level behavior.
 *
 * Packer unit tests live in keyBundler.test.js. This file verifies that the
 * orchestrator:
 *   - wires settings → packBundle → domainArgs.passengers correctly
 *   - loops submitCandidate for each passenger with the primary's run_number
 *   - stamps `rode_with` on each passenger's selected.keys entry
 *   - extends history scope so a key resolved as passenger shows up in its
 *     own per-key history query (via filterRunsByFieldKey broadening in routes)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runKeyFinder } from '../keyFinder.js';
import { readKeyFinder } from '../keyStore.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

const PRODUCT = {
  product_id: 'kfb-001',
  category: 'mouse',
  brand: 'Razer',
  model: 'DeathAdder V3 Pro',
  base_model: 'DeathAdder V3 Pro',
  variant: '',
};

function rule(overrides = {}) {
  return {
    difficulty: 'easy',
    required_level: 'non_mandatory',
    availability: 'always',
    group: 'sensor_performance',
    enum: { policy: 'open' },
    evidence: { min_evidence_refs: 1 },
    ai_assist: { reasoning_note: '' },
    contract: { type: 'string', shape: 'scalar' },
    variant_dependent: false,
    ...overrides,
  };
}

// Primary = medium (pool=4), passengers in same group:
// - dpi (easy, cost 1)
// - buttons (easy, cost 1)
// - tracking (medium, cost 2) — brings total to 4
// - sensor_model (very_hard, cost 8) — won't fit (also filtered by less_or_equal)
// - color (easy, cross-group) — filtered by groupBundlingOnly
// - polling_variant (easy, variant_dependent=true) — safety filter
const BUNDLE_RULES = {
  fields: {
    polling_rate: rule({ difficulty: 'medium', required_level: 'mandatory' }),
    dpi: rule({ difficulty: 'easy', required_level: 'mandatory' }),
    buttons: rule({ difficulty: 'easy', required_level: 'non_mandatory' }),
    tracking: rule({ difficulty: 'medium', required_level: 'mandatory' }),
    sensor_model: rule({ difficulty: 'very_hard', required_level: 'mandatory' }),
    color: rule({ group: 'appearance' }),
    polling_variant: rule({ variant_dependent: true, required_level: 'mandatory' }),
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

const BUNDLING_ON_KNOBS = {
  bundlingEnabled: 'true',
  groupBundlingOnly: 'true',
  // Legacy bundled-Run path — these integration tests exercise the packer via
  // Run mode, so alwaysSoloRun must be off. The new alwaysSoloRun=true gate is
  // covered by dedicated tests below.
  alwaysSoloRun: 'false',
  bundlingPassengerCost: JSON.stringify({ easy: 1, medium: 2, hard: 4, very_hard: 8 }),
  bundlingPassengerVariantCostPerExtra: '0',
  bundlingPoolPerPrimary: JSON.stringify({ easy: 6, medium: 4, hard: 2, very_hard: 1 }),
  passengerDifficultyPolicy: 'less_or_equal',
  budgetRequiredPoints: JSON.stringify({ mandatory: 2, non_mandatory: 1 }),
  budgetAvailabilityPoints: JSON.stringify({ always: 1, sometimes: 2, rare: 3 }),
  budgetDifficultyPoints: JSON.stringify({ easy: 1, medium: 2, hard: 3, very_hard: 4 }),
  budgetVariantPointsPerExtra: '1',
  budgetFloor: '3',
  urlHistoryEnabled: 'true',
  queryHistoryEnabled: 'true',
  componentInjectionEnabled: 'true',
  knownFieldsInjectionEnabled: 'true',
  searchHintsInjectionEnabled: 'true',
};

const BUNDLING_OFF_KNOBS = { ...BUNDLING_ON_KNOBS, bundlingEnabled: 'false' };

function evRef(url) {
  return { url, tier: 'tier1', confidence: 90, supporting_evidence: 'cited', evidence_kind: 'direct_quote' };
}

function responseWithPassengers(primaryFk, passengerFks) {
  const results = {
    [primaryFk]: {
      value: 8000,
      confidence: 88,
      unknown_reason: '',
      evidence_refs: [evRef(`https://example.com/${primaryFk}`)],
      discovery_log: { urls_checked: [`https://example.com/${primaryFk}`], queries_run: [primaryFk], notes: [] },
    },
  };
  for (const fk of passengerFks) {
    results[fk] = {
      value: `${fk}-value`,
      confidence: 80,
      unknown_reason: '',
      evidence_refs: [evRef(`https://example.com/${fk}`)],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    };
  }
  return {
    result: {
      primary_field_key: primaryFk,
      results,
      discovery_log: { urls_checked: [`https://example.com/${primaryFk}`], queries_run: [primaryFk], notes: [] },
    },
    usage: null,
  };
}

// ─── Stubs ───────────────────────────────────────────────────────────────

function makeFinderStoreStub(settings) {
  const upserts = [];
  const runs = [];
  return {
    store: {
      getSetting: (k) => (k in settings ? String(settings[k]) : ''),
      upsert: (r) => { upserts.push(r); },
      insertRun: (r) => { runs.push(r); },
    },
    upserts,
    runs,
  };
}

function makeSpecDbStub({ finderStore, resolvedSet = new Set(), bucketsByFieldKey = {}, activeVariants } = {}) {
  const variants = activeVariants || [{ variant_id: 'v0', variant_key: 'default', variant_label: 'Default', variant_type: 'base' }];
  return {
    category: 'mouse',
    getFinderStore: (id) => (id === 'keyFinder' ? finderStore : null),
    getCompiledRules: () => BUNDLE_RULES,
    getProduct: () => null,
    variants: {
      listActive: () => variants,
      listByProduct: () => variants,
    },
    getFieldCandidatesByProductAndField: () => [],
    // Any key in resolvedSet is treated as published-resolved → excluded by packer
    getResolvedFieldCandidate: (_pid, fk) => (resolvedSet.has(fk) ? { value: 'X', confidence: 95 } : null),
    // Bucket evaluator contract — used by isConcreteEvidence via evaluateFieldBuckets.
    // Short-hand: bucketsByFieldKey[fk] = { top_confidence, pooled_count } drives
    // both methods below; absence means no candidates for that key.
    listFieldBuckets: ({ fieldKey }) => {
      const b = bucketsByFieldKey[fieldKey];
      if (!b) return [];
      return [{
        value_fingerprint: `fp_${fieldKey}`,
        top_confidence: Number(b.top_confidence) || 0,
        member_count: Number(b.pooled_count) || 0,
        member_ids: [1],
        value: 'X',
      }];
    },
    countPooledQualifyingEvidenceByFingerprint: ({ fieldKey }) => {
      const b = bucketsByFieldKey[fieldKey];
      return Number(b?.pooled_count) || 0;
    },
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────

const TMP = path.join(os.tmpdir(), `kfb-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP, 'products');

function cleanupTmp() {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ }
}

function setupForProduct(productId, { settings = BUNDLING_ON_KNOBS, resolvedSet = new Set(), bucketsByFieldKey = {}, activeVariants } = {}) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({ product_id: productId, category: 'mouse', candidates: {}, fields: {} }));
  const fsStub = makeFinderStoreStub(settings);
  const specDb = makeSpecDbStub({ finderStore: fsStub.store, resolvedSet, bucketsByFieldKey, activeVariants });
  return { fsStub, specDb };
}

// ─── Tests ───────────────────────────────────────────────────────────────

test('solo path unchanged when bundlingEnabled=false', async (t) => {
  t.after(cleanupTmp);
  const { fsStub, specDb } = setupForProduct('kfb-solo', { settings: BUNDLING_OFF_KNOBS });
  let capturedDomainArgs = null;
  const submits = [];

  const result = await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-solo' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedDomainArgs = domainArgs;
      return responseWithPassengers('polling_rate', []);
    },
    _submitCandidateOverride: async (args) => { submits.push(args); return { status: 'accepted' }; },
  });

  assert.deepEqual(capturedDomainArgs.passengers, [], 'solo run has zero passengers');
  assert.equal(submits.length, 1, 'only primary is submitted');
  assert.equal(submits[0].fieldKey, 'polling_rate');
  assert.deepEqual(result.passenger_candidates, [], 'passenger_candidates is empty array in solo mode');
});

test('passengers populate domainArgs + user_message.passenger_count when bundling ON', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-domain');
  let capturedDomainArgs = null;
  let capturedUserMsg = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-domain' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedDomainArgs = domainArgs;
      // The orchestrator calls LLM via createKeyFinderCallLlm which builds the
      // user message internally; for override-harness, we only see domainArgs.
      // Read user message from the merged JSON after the call returns.
      return responseWithPassengers('polling_rate', capturedDomainArgs.passengers.map((p) => p.fieldKey));
    },
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  const pkFks = capturedDomainArgs.passengers.map((p) => p.fieldKey);
  assert.ok(pkFks.length >= 2, `expected at least 2 passengers, got ${pkFks.length}: ${pkFks.join(', ')}`);
  // Expected based on default pool[medium]=4 + costs: dpi(1) + buttons(1) + tracking(2) = 4
  assert.ok(pkFks.includes('dpi'));
  assert.ok(pkFks.includes('buttons'));
  assert.ok(pkFks.includes('tracking'));
  // Filtered keys should NOT appear:
  assert.ok(!pkFks.includes('sensor_model'), 'very_hard peer excluded by less_or_equal vs medium primary');
  assert.ok(!pkFks.includes('color'), 'cross-group peer excluded by groupBundlingOnly=true');
  assert.ok(!pkFks.includes('polling_variant'), 'variant_dependent peer filtered by safety');

  // Verify user message via persisted run record (the run's prompt.user is
  // the JSON-stringified user message)
  const doc = readKeyFinder({ productId: 'kfb-domain', productRoot: PRODUCT_ROOT });
  const run = doc.runs[doc.runs.length - 1];
  const userMsg = JSON.parse(run.prompt.user);
  assert.equal(userMsg.passenger_count, pkFks.length);
  capturedUserMsg = userMsg;
  assert.equal(capturedUserMsg.primary_field_key, 'polling_rate');
});

test('live bundling applies passenger variant surcharge from family size', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-variant-cost', {
    settings: {
      ...BUNDLING_ON_KNOBS,
      bundlingPassengerVariantCostPerExtra: '0.25',
      bundlingPoolPerPrimary: JSON.stringify({ easy: 2, medium: 2, hard: 2, very_hard: 2 }),
    },
    activeVariants: [
      { variant_id: 'v1' },
      { variant_id: 'v2' },
      { variant_id: 'v3' },
      { variant_id: 'v4' },
    ],
  });
  let capturedDomainArgs = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-variant-cost' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    mode: 'run',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedDomainArgs = domainArgs;
      return responseWithPassengers('polling_rate', domainArgs.passengers.map((p) => p.fieldKey));
    },
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  assert.deepEqual(
    capturedDomainArgs.passengers.map((p) => p.fieldKey),
    ['dpi'],
    'family size 4 makes each easy passenger cost 1.75, so pool 2 fits only one live passenger',
  );
});

test('passenger submissions use primary run_number + correct fieldKey', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-submit');
  const submits = [];

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-submit' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => responseWithPassengers('polling_rate', domainArgs.passengers.map((p) => p.fieldKey)),
    _submitCandidateOverride: async (args) => { submits.push(args); return { status: 'accepted' }; },
  });

  const byKey = new Map(submits.map((s) => [s.fieldKey, s]));
  const primaryRunNumber = byKey.get('polling_rate').sourceMeta.run_number;
  assert.equal(typeof primaryRunNumber, 'number');

  // Every passenger submit shares the primary's run_number
  for (const [fk, s] of byKey) {
    assert.equal(s.sourceMeta.run_number, primaryRunNumber, `${fk} must share primary run_number`);
    assert.equal(s.variantId, null, `${fk} product-scoped (no variantId)`);
    assert.equal(s.sourceMeta.source, 'key_finder');
  }

  // Passenger submits exist for dpi, buttons, tracking
  assert.ok(byKey.has('dpi'));
  assert.ok(byKey.has('buttons'));
  assert.ok(byKey.has('tracking'));
});

test('selected.keys carries rode_with attribution for every passenger', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-rodewith');

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-rodewith' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => responseWithPassengers('polling_rate', domainArgs.passengers.map((p) => p.fieldKey)),
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  const doc = readKeyFinder({ productId: 'kfb-rodewith', productRoot: PRODUCT_ROOT });
  const run = doc.runs[doc.runs.length - 1];
  const sel = run.selected.keys;

  assert.equal(sel.polling_rate.rode_with, null, 'primary key has rode_with=null');
  for (const fk of ['dpi', 'buttons', 'tracking']) {
    assert.ok(sel[fk], `passenger ${fk} present in selected.keys`);
    assert.equal(sel[fk].rode_with, 'polling_rate', `passenger ${fk} attributed to polling_rate`);
  }
});

test('unk + no_evidence passengers are NOT submitted but still appear in passenger_candidates', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-unk');
  const submits = [];

  const result = await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-unk' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      const pkFks = domainArgs.passengers.map((p) => p.fieldKey);
      // Build response where dpi returns unk, buttons is resolved, tracking has no evidence
      const results = {
        polling_rate: {
          value: 8000, confidence: 88, unknown_reason: '',
          evidence_refs: [evRef('https://example.com/polling_rate')],
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
      };
      if (pkFks.includes('dpi')) {
        results.dpi = { value: 'unk', confidence: 0, unknown_reason: 'not disclosed', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } };
      }
      if (pkFks.includes('buttons')) {
        results.buttons = { value: 6, confidence: 85, unknown_reason: '', evidence_refs: [evRef('https://example.com/buttons')], discovery_log: { urls_checked: [], queries_run: [], notes: [] } };
      }
      if (pkFks.includes('tracking')) {
        results.tracking = { value: 'optical', confidence: 80, unknown_reason: '', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } };
      }
      return { result: { primary_field_key: 'polling_rate', results, discovery_log: { urls_checked: [], queries_run: [], notes: [] } }, usage: null };
    },
    _submitCandidateOverride: async (args) => { submits.push(args); return { status: 'accepted' }; },
  });

  const submitKeys = submits.map((s) => s.fieldKey).sort();
  assert.deepEqual(submitKeys, ['buttons', 'polling_rate'], 'only primary + buttons are submitted');

  const pcByKey = new Map(result.passenger_candidates.map((pc) => [pc.fieldKey, pc]));
  assert.equal(pcByKey.get('dpi')?.status, 'unk');
  assert.equal(pcByKey.get('buttons')?.status, 'accepted');
  assert.equal(pcByKey.get('tracking')?.status, 'no_evidence');
});

test('already-published passengers excluded via specDb.getResolvedFieldCandidate (legacy gate — concrete knobs disabled)', async (t) => {
  // Under replace-semantics (concrete knobs > 0) the contract flips: published
  // but below-concrete peers keep riding to accumulate evidence. This test
  // pins the LEGACY path — knobs at 0, resolved peers unconditionally dropped.
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-resolved', {
    resolvedSet: new Set(['dpi', 'buttons']), // both already resolved
    settings: { ...BUNDLING_ON_KNOBS, passengerExcludeAtConfidence: '0', passengerExcludeMinEvidence: '0' },
  });
  let capturedPassengers = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-resolved' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedPassengers = domainArgs.passengers.map((p) => p.fieldKey);
      return responseWithPassengers('polling_rate', capturedPassengers);
    },
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  assert.ok(!capturedPassengers.includes('dpi'), 'resolved dpi excluded');
  assert.ok(!capturedPassengers.includes('buttons'), 'resolved buttons excluded');
  assert.ok(capturedPassengers.includes('tracking'), 'tracking still eligible');
});

test('bundling-OFF settings produce zero passengers even when other settings exist', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-off', { settings: BUNDLING_OFF_KNOBS });
  let capturedPassengers = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-off' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedPassengers = domainArgs.passengers;
      return responseWithPassengers('polling_rate', []);
    },
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  assert.deepEqual(capturedPassengers, []);
});

// ─── alwaysSoloRun — Run-mode is always solo (new 2026-04-22) ────────────

const ALWAYS_SOLO_ON = { ...BUNDLING_ON_KNOBS, alwaysSoloRun: 'true' };

test('mode="run" + alwaysSoloRun=true + bundling ON → passengers suppressed (Run is focused)', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-solorun-run', { settings: ALWAYS_SOLO_ON });
  let capturedPassengers = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-solorun-run' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    mode: 'run',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedPassengers = domainArgs.passengers;
      return responseWithPassengers('polling_rate', []);
    },
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  assert.deepEqual(capturedPassengers, [], 'Run honors alwaysSoloRun=true');
});

test('default mode (no arg) treated as "run" → alwaysSoloRun=true suppresses passengers', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-solorun-default', { settings: ALWAYS_SOLO_ON });
  let capturedPassengers = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-solorun-default' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    // no mode arg on purpose
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedPassengers = domainArgs.passengers;
      return responseWithPassengers('polling_rate', []);
    },
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  assert.deepEqual(capturedPassengers, [], 'default mode = Run → solo');
});

test('mode="loop" + alwaysSoloRun=true + bundling ON → passengers still pack (Loop path)', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-solorun-loop', { settings: ALWAYS_SOLO_ON });
  let capturedPassengers = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-solorun-loop' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    mode: 'loop',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedPassengers = domainArgs.passengers.map((p) => p.fieldKey);
      return responseWithPassengers('polling_rate', capturedPassengers);
    },
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  assert.ok(capturedPassengers.length >= 2, `Loop mode packs passengers even with alwaysSoloRun=true; got ${capturedPassengers.join(', ')}`);
});

test('mode="run" + alwaysSoloRun=false (legacy) → passengers pack', async (t) => {
  t.after(cleanupTmp);
  // Existing BUNDLING_ON_KNOBS has alwaysSoloRun='false' already; this test
  // is the explicit contract that Run can bundle when the knob is OFF.
  const { specDb } = setupForProduct('kfb-solorun-legacy');
  let capturedPassengers = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-solorun-legacy' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    mode: 'run',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedPassengers = domainArgs.passengers.map((p) => p.fieldKey);
      return responseWithPassengers('polling_rate', capturedPassengers);
    },
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  assert.ok(capturedPassengers.length >= 2, `Run with alwaysSoloRun=false bundles; got ${capturedPassengers.join(', ')}`);
});

test('onPassengersRegistered fires once with the packed passenger field_keys after registration', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-onreg');
  const registrationEvents = [];

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-onreg' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    onPassengersRegistered: (passengerFieldKeys) => {
      registrationEvents.push([...passengerFieldKeys]);
    },
    _callLlmOverride: async (domainArgs) => responseWithPassengers(
      'polling_rate',
      domainArgs.passengers.map((p) => p.fieldKey),
    ),
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  assert.equal(registrationEvents.length, 1, 'callback fires exactly once');
  const passengers = registrationEvents[0];
  // Default bundling ON + less_or_equal + medium primary + pool=4: dpi + buttons + tracking
  assert.ok(passengers.includes('dpi'));
  assert.ok(passengers.includes('buttons'));
  assert.ok(passengers.includes('tracking'));
  assert.ok(!passengers.includes('sensor_model'), 'very_hard peer filtered out');
  assert.ok(!passengers.includes('color'), 'cross-group peer filtered out');
});

test('onPassengersRegistered fires with empty array under alwaysSoloRun=true + mode=run', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-onreg-solo', {
    settings: { ...BUNDLING_ON_KNOBS, alwaysSoloRun: 'true' },
  });
  const registrationEvents = [];

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-onreg-solo' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    mode: 'run',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    onPassengersRegistered: (passengerFieldKeys) => {
      registrationEvents.push([...passengerFieldKeys]);
    },
    _callLlmOverride: async () => responseWithPassengers('polling_rate', []),
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  assert.equal(registrationEvents.length, 1, 'callback still fires — panel needs the invalidation even when solo');
  assert.deepEqual(registrationEvents[0], [], 'passengers array is empty under alwaysSoloRun=true + run');
});

// ─── passengerExclude* knobs wired from settings → buildPassengers ────────
// Asserts the live runner reads the two exclude knobs into its settings bundle
// and that buildPassengers routes through the publisher's bucket evaluator to
// honor them. Peer 'dpi' has a bucket that qualifies under 95/3 → excluded;
// peer 'buttons' has a bucket that qualifies only under 70/1 (publisher's
// default) but NOT under the stricter exclude thresholds → still packed.
test('passengerExclude* knobs wired: concrete-bar peer drops, weak-bar peer packs', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setupForProduct('kfb-concrete', {
    settings: {
      ...BUNDLING_ON_KNOBS,
      passengerExcludeAtConfidence: '95',
      passengerExcludeMinEvidence: '3',
    },
    bucketsByFieldKey: {
      // qualifies at 95/3 → excluded from passenger pool
      dpi: { top_confidence: 98, pooled_count: 4 },
      // weak publish: qualifies at 70/1 but fails 95/3 (top_confidence < 95)
      buttons: { top_confidence: 80, pooled_count: 5 },
      // no bucket → unaffected, packs normally
    },
  });
  let captured = null;

  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfb-concrete' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      captured = domainArgs;
      return responseWithPassengers('polling_rate', domainArgs.passengers.map((p) => p.fieldKey));
    },
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  const keys = captured.passengers.map((p) => p.fieldKey);
  assert.ok(!keys.includes('dpi'), 'dpi excluded: bucket qualifies under stricter 95/3 thresholds');
  assert.ok(keys.includes('buttons'), 'buttons packed: bucket below stricter thresholds');
  assert.ok(keys.includes('tracking'), 'tracking packed: no bucket data, nothing to exclude');
});
