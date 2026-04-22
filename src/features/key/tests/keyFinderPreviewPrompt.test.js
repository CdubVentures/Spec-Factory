/**
 * Key Finder — prompt preview compiler tests.
 *
 * Mirrors skuFinderPreviewPrompt.test.js. Critical test: drift-guard asserting
 * that the preview compiler's systemPrompt + userMessage match what the live
 * runner (runKeyFinder) would emit byte-for-byte. If they drift, the Bundled
 * column and the prompt preview lie to the user.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { compileKeyFinderPreviewPrompt } from '../keyFinderPreviewPrompt.js';
import { runKeyFinder } from '../keyFinder.js';
import { buildPassengers } from '../keyPassengerBuilder.js';

// ── Fixtures ────────────────────────────────────────────────────────────

const PRODUCT = {
  product_id: 'kfp-001',
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

const COMPILED = {
  fields: {
    polling_rate: rule({ difficulty: 'medium', required_level: 'mandatory' }),
    dpi: rule({ difficulty: 'easy', required_level: 'mandatory' }),
    buttons: rule({ difficulty: 'easy', required_level: 'non_mandatory' }),
    tracking: rule({ difficulty: 'medium', required_level: 'mandatory' }),
    color: rule({ group: 'appearance' }), // cross-group — filtered by groupBundlingOnly
  },
  known_values: {},
};

const POLICY = {
  keyFinderTiers: {
    easy: { model: 'gpt-5.4-mini', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    medium: { model: 'gpt-5.4-mini', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
    hard: { model: 'gpt-5.4', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
    very_hard: { model: 'gpt-5.4', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
    fallback: { model: 'gpt-5.4', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
  },
  models: { plan: 'gpt-5.4' },
};

const BUNDLING_ON = {
  bundlingEnabled: 'true',
  groupBundlingOnly: 'true',
  bundlingPassengerCost: JSON.stringify({ easy: 1, medium: 2, hard: 4, very_hard: 8 }),
  bundlingPoolPerPrimary: JSON.stringify({ easy: 6, medium: 4, hard: 2, very_hard: 1 }),
  passengerDifficultyPolicy: 'less_or_equal',
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

const BUNDLING_OFF = { ...BUNDLING_ON, bundlingEnabled: 'false' };

function makeFinderStoreStub(settings) {
  return {
    getSetting: (k) => (k in settings ? String(settings[k]) : ''),
    upsert: () => {},
    insertRun: () => {},
  };
}

function makeSpecDbStub({ finderStore, resolvedSet = new Set() } = {}) {
  return {
    category: 'mouse',
    getFinderStore: (id) => (id === 'keyFinder' ? finderStore : null),
    getCompiledRules: () => COMPILED,
    getProduct: () => ({ product_id: PRODUCT.product_id, category: 'mouse', brand: PRODUCT.brand, model: PRODUCT.model, base_model: PRODUCT.base_model }),
    variants: {
      listActive: () => [{ variant_id: 'v0', variant_key: 'default', variant_label: 'Default', variant_type: 'base' }],
      listByProduct: () => [{ variant_id: 'v0', variant_key: 'default', variant_label: 'Default', variant_type: 'base' }],
    },
    getFieldCandidatesByProductAndField: () => [],
    getResolvedFieldCandidate: (_pid, fk) => (resolvedSet.has(fk) ? { value: 'X', confidence: 95 } : null),
    getItemComponentLinks: () => [],
  };
}

const TMP = path.join(os.tmpdir(), `kfp-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP, 'products');

function cleanupTmp() { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } }

function setup(productId, { settings = BUNDLING_ON, resolvedSet = new Set() } = {}) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({ product_id: productId, category: 'mouse', candidates: {}, fields: {} }));
  const finderStore = makeFinderStoreStub(settings);
  const specDb = makeSpecDbStub({ finderStore, resolvedSet });
  return { specDb };
}

// ── Tests ─────────────────────────────────────────────────────────────

test('happy path: valid field_key returns envelope with compiled prompt', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-happy');

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-happy' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate' },
  });

  assert.equal(env.finder, 'key');
  assert.equal(env.mode, 'run');
  assert.equal(env.prompts.length, 1);
  assert.ok(env.prompts[0].system.length > 0, 'system prompt non-empty');
  assert.ok(env.prompts[0].user.length > 0, 'user message non-empty');
  const userJson = JSON.parse(env.prompts[0].user);
  assert.equal(userJson.primary_field_key, 'polling_rate');
  assert.equal(typeof userJson.passenger_count, 'number');
});

test('missing field_key → 400', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-nofk');
  await assert.rejects(
    () => compileKeyFinderPreviewPrompt({
      product: { ...PRODUCT, product_id: 'kfp-nofk' },
      specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT, body: {},
    }),
    (err) => err.statusCode === 400 && /field_key is required/.test(err.message),
  );
});

test('reserved field_key → 400', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-reserved');
  await assert.rejects(
    () => compileKeyFinderPreviewPrompt({
      product: { ...PRODUCT, product_id: 'kfp-reserved' },
      specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
      body: { field_key: 'colors' }, // CEF-owned reserved key
    }),
    (err) => err.statusCode === 400 && /reserved_field_key/.test(err.message),
  );
});

test('field_key not in compiled rules → 400', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-missing');
  await assert.rejects(
    () => compileKeyFinderPreviewPrompt({
      product: { ...PRODUCT, product_id: 'kfp-missing' },
      specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
      body: { field_key: 'not_in_rules' },
    }),
    (err) => err.statusCode === 400 && /missing_field_rule/.test(err.message),
  );
});

test('drift guard: preview passenger_field_keys match buildPassengers directly (Loop mode)', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-drift');

  const directPassengers = buildPassengers({
    primary: { fieldKey: 'polling_rate', fieldRule: COMPILED.fields.polling_rate },
    engineRules: COMPILED.fields,
    specDb,
    productId: 'kfp-drift',
    settings: {
      bundlingEnabled: true,
      groupBundlingOnly: true,
      bundlingPassengerCost: { easy: 1, medium: 2, hard: 4, very_hard: 8 },
      bundlingPoolPerPrimary: { easy: 6, medium: 4, hard: 2, very_hard: 1 },
      passengerDifficultyPolicy: 'less_or_equal',
    },
  });

  // Preview with mode='loop' so alwaysSoloRun gate is bypassed, matching
  // the direct buildPassengers call which ignores alwaysSoloRun.
  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-drift' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate', mode: 'loop' },
  });

  const directKeys = directPassengers.map((p) => p.fieldKey);
  assert.deepEqual(
    env.inputs_resolved.passenger_field_keys,
    directKeys,
    'preview must use same buildPassengers output as runtime — no drift allowed',
  );
});

test('drift guard: preview systemPrompt matches live runner byte-for-byte', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-byte');

  const preview = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-byte' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate' },
  });

  let capturedDomainArgs = null;
  let capturedRunSystemPrompt = null;
  await runKeyFinder({
    product: { ...PRODUCT, product_id: 'kfp-byte' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb, appDb: null, config: {},
    productRoot: PRODUCT_ROOT,
    policy: POLICY,
    _callLlmOverride: async (domainArgs) => {
      capturedDomainArgs = domainArgs;
      return {
        result: {
          primary_field_key: 'polling_rate',
          results: {
            polling_rate: {
              value: 8000, confidence: 90, unknown_reason: '',
              evidence_refs: [{ url: 'https://razer.com', tier: 'tier1', confidence: 90, supporting_evidence: 'cited', evidence_kind: 'direct_quote' }],
              discovery_log: { urls_checked: [], queries_run: [], notes: [] },
            },
          },
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
        usage: null,
      };
    },
    _submitCandidateOverride: async () => ({ status: 'accepted' }),
  });

  // Pull the runner's systemPrompt back through keyStore — it's persisted
  // at runs[0].prompt.system after the run completes.
  const keyFinderDoc = JSON.parse(
    fs.readFileSync(path.join(PRODUCT_ROOT, 'kfp-byte', 'key_finder.json'), 'utf8'),
  );
  capturedRunSystemPrompt = keyFinderDoc.runs[0].prompt.system;

  assert.equal(
    preview.prompts[0].system,
    capturedRunSystemPrompt,
    'preview system prompt must match live runner byte-for-byte',
  );
  // Double-check passengers fed to buildKeyFinderPrompt match preview's claim
  const runnerPassengerKeys = capturedDomainArgs.passengers.map((p) => p.fieldKey);
  assert.deepEqual(preview.inputs_resolved.passenger_field_keys, runnerPassengerKeys);
});

test('bundling ON: systemPrompt contains ADDITIONAL_FIELD_KEYS section when passengers present (Loop mode)', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-adl-on');

  // mode='loop' bypasses the alwaysSoloRun gate so passengers pack into preview.
  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-adl-on' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate', mode: 'loop' },
  });

  assert.ok(env.inputs_resolved.passenger_field_keys.length > 0, 'fixture must produce passengers');
  // buildAdditionalFieldKeysBlock emits a header — when passengers exist the
  // system prompt should reference the passenger field keys.
  for (const pfk of env.inputs_resolved.passenger_field_keys) {
    assert.ok(
      env.prompts[0].system.includes(pfk),
      `expected passenger field_key "${pfk}" to appear in system prompt`,
    );
  }
});

test('bundling OFF: passenger_field_keys is [] and userMessage has passenger_count:0', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-off', { settings: BUNDLING_OFF });

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-off' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate' },
  });

  assert.deepEqual(env.inputs_resolved.passenger_field_keys, []);
  assert.equal(env.inputs_resolved.bundling.enabled, false);
  const userJson = JSON.parse(env.prompts[0].user);
  assert.equal(userJson.passenger_count, 0);
});

test('notes include bundling state', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-notes');

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-notes' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate' },
  });

  const joined = env.prompts[0].notes.join('\n');
  assert.match(joined, /bundling_enabled: true/);
  assert.match(joined, /passenger_policy: less_or_equal/);
  assert.match(joined, /tier: medium/);
});

// ─── Registry parity (new 2026-04-22) ─────────────────────────────────

import {
  register as registryRegister,
  _resetForTest as registryReset,
  _sizeForTest as registrySize,
} from '../../../core/operations/keyFinderRegistry.js';

test('registry parity: peer as primary elsewhere is excluded from preview passengers (Loop mode)', async (t) => {
  t.after(cleanupTmp);
  t.after(() => registryReset());
  registryReset();
  const { specDb } = setup('kfp-registry-primary');
  // dpi is running as primary in some other in-flight call
  registryRegister('kfp-registry-primary', 'dpi', 'primary');

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-registry-primary' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate', mode: 'loop' },
  });

  assert.ok(
    !env.inputs_resolved.passenger_field_keys.includes('dpi'),
    'dpi hard-blocked in preview just like a live Loop would see it',
  );
});

test('registry parity: preview does NOT register or release (read-only)', async (t) => {
  t.after(cleanupTmp);
  t.after(() => registryReset());
  registryReset();
  const { specDb } = setup('kfp-registry-noside');
  const sizeBefore = registrySize();

  await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-registry-noside' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate', mode: 'loop' },
  });

  assert.equal(registrySize(), sizeBefore, 'preview must not register anything');
});

test('registry parity: peer at cap excluded from preview', async (t) => {
  t.after(cleanupTmp);
  t.after(() => registryReset());
  registryReset();
  const { specDb } = setup('kfp-registry-cap');
  // dpi is already passenger in 2 other in-flight calls (easy cap = 2)
  registryRegister('kfp-registry-cap', 'dpi', 'passenger');
  registryRegister('kfp-registry-cap', 'dpi', 'passenger');

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-registry-cap' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate', mode: 'loop' },
  });

  assert.ok(
    !env.inputs_resolved.passenger_field_keys.includes('dpi'),
    'dpi at cap is skipped in preview',
  );
});
