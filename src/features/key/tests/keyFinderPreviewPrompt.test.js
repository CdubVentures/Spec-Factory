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
  bundlingPassengerVariantCostPerExtra: '0.25',
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

function makeSpecDbStub({
  finderStore,
  productImageFinderStore = null,
  resolvedSet = new Set(),
  bucketsByFieldKey = {},
  activeVariants,
  productRows = [],
  compiledRules = COMPILED,
  fieldCandidateRows = {},
  pifProgressRows = [],
  colorEditionRow = { default_color: '' },
} = {}) {
  const variants = activeVariants || [{ variant_id: 'v0', variant_key: 'default', variant_label: 'Default', variant_type: 'base' }];
  return {
    category: 'mouse',
    getFinderStore: (id) => {
      if (id === 'keyFinder') return finderStore;
      if (id === 'productImageFinder') return productImageFinderStore;
      return null;
    },
    getCompiledRules: () => compiledRules,
    getColorEditionFinder: () => colorEditionRow,
    getProduct: () => ({ product_id: PRODUCT.product_id, category: 'mouse', brand: PRODUCT.brand, model: PRODUCT.model, base_model: PRODUCT.base_model }),
    getAllProducts: () => productRows,
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
    getResolvedFieldCandidate: (_pid, fk) => (resolvedSet.has(fk) ? { value: 'X', confidence: 95 } : null),
    getItemComponentLinks: () => [],
    // Bucket evaluator contract — drives isConcreteEvidence.
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

const TMP = path.join(os.tmpdir(), `kfp-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP, 'products');
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

function cleanupTmp() { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } }

function writePifImageFixture(productId, { images }) {
  const productDir = path.join(PRODUCT_ROOT, productId);
  const imagesDir = path.join(productDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
  for (const img of images) {
    if (img.filename) {
      fs.writeFileSync(path.join(imagesDir, img.filename), ONE_PIXEL_PNG);
    }
  }
  fs.writeFileSync(
    path.join(productDir, 'product_images.json'),
    JSON.stringify({
      product_id: productId,
      category: 'mouse',
      selected: { images },
      runs: [],
      carousel_slots: {},
    }, null, 2),
  );
}

function setup(productId, {
  settings = BUNDLING_ON,
  pifSettings = {},
  resolvedSet = new Set(),
  bucketsByFieldKey = {},
  activeVariants,
  productRows = [],
  compiledRules = COMPILED,
  fieldCandidateRows = {},
  pifProgressRows = [],
  colorEditionRow = { default_color: '' },
} = {}) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({ product_id: productId, category: 'mouse', candidates: {}, fields: {} }));
  const finderStore = makeFinderStoreStub(settings);
  const productImageFinderStore = {
    getSetting: (k) => (k in pifSettings ? String(pifSettings[k]) : ''),
  };
  const specDb = makeSpecDbStub({
    finderStore,
    productImageFinderStore,
    resolvedSet,
    bucketsByFieldKey,
    activeVariants,
    productRows,
    compiledRules,
    fieldCandidateRows,
    pifProgressRows,
    colorEditionRow,
  });
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

test('prompt preview includes PIF priority image context and sidecar images when key knob is enabled', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kfp-pif-images';
  const compiledRules = {
    fields: {
      design: rule({
        group: 'appearance',
        difficulty: 'medium',
        contract: { type: 'string', shape: 'list' },
        ai_assist: {
          reasoning_note: 'Use visual context only when it directly supports this key.',
          pif_priority_images: { enabled: true },
        },
      }),
    },
    known_values: {},
  };
  writePifImageFixture(productId, {
    images: [
      {
        filename: 'top-black.png',
        view: 'top',
        variant_id: 'v_black',
        variant_key: 'color:black',
        variant_label: 'Black',
        variant_type: 'color',
        eval_best: true,
        eval_reasoning: 'Clear top shell view.',
        bytes: 111,
      },
      {
        filename: 'bottom-black.png',
        view: 'bottom',
        variant_id: 'v_black',
        variant_key: 'color:black',
        variant_label: 'Black',
        variant_type: 'color',
        eval_best: true,
      },
    ],
  });
  const { specDb } = setup(productId, {
    compiledRules,
    activeVariants: [
      { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color', color_atoms: ['black'] },
    ],
    colorEditionRow: { default_color: 'black' },
    pifSettings: {
      viewConfig: JSON.stringify([
        { key: 'top', priority: true, description: 'Top' },
        { key: 'bottom', priority: false, description: 'Bottom' },
      ]),
    },
  });

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: productId },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'design' },
  });

  const prompt = env.prompts[0];
  assert.match(prompt.system, /PIF_PRIORITY_IMAGES/);
  assert.match(prompt.system, /default\/base variant images are attached/i);
  assert.match(prompt.system, /Priority views from PIF viewConfig: top/);
  assert.match(prompt.system, /top-black\.png/);
  assert.equal(prompt.images?.length, 1);
  assert.equal(prompt.images?.[0]?.url, '/api/v1/product-image-finder/mouse/kfp-pif-images/images/top-black.png?v=111');
});

test('prompt preview changes PIF image injection text when enabled but no images exist', async (t) => {
  t.after(cleanupTmp);
  const productId = 'kfp-pif-missing';
  const compiledRules = {
    fields: {
      design: rule({
        group: 'appearance',
        contract: { type: 'string', shape: 'list' },
        ai_assist: { pif_priority_images: { enabled: true } },
      }),
    },
    known_values: {},
  };
  const { specDb } = setup(productId, {
    compiledRules,
    activeVariants: [
      { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color', color_atoms: ['black'] },
    ],
    colorEditionRow: { default_color: 'black' },
    pifSettings: {
      viewConfig: JSON.stringify([{ key: 'top', priority: true, description: 'Top' }]),
    },
  });

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: productId },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'design' },
  });

  const prompt = env.prompts[0];
  assert.match(prompt.system, /PIF_PRIORITY_IMAGES/);
  assert.match(prompt.system, /enabled for this key, but no PIF-evaluated priority images are available/i);
  assert.match(prompt.system, /Do not infer visual traits from missing PIF images/i);
  assert.equal(prompt.images?.length || 0, 0);
});

test('prompt preview resolves known_values enum lists for primary and passenger keys', async (t) => {
  t.after(cleanupTmp);
  const compiledRules = {
    fields: {
      connection: rule({
        group: 'connectivity',
        difficulty: 'medium',
        required_level: 'mandatory',
        contract: { type: 'string', shape: 'scalar' },
        enum: { policy: 'closed', source: 'data_lists.connection' },
      }),
      connectivity: rule({
        group: 'connectivity',
        difficulty: 'easy',
        required_level: 'mandatory',
        contract: { type: 'string', shape: 'list' },
        enum: { policy: 'open_prefer_known', source: 'data_lists.connectivity' },
      }),
    },
    known_values: {
      enums: {
        connection: { policy: 'closed', values: ['wired', 'wireless', 'hybrid'] },
        connectivity: { policy: 'open_prefer_known', values: ['2.4GHz Dongle', 'Bluetooth'] },
      },
    },
  };
  const { specDb } = setup('kfp-known-enums', { compiledRules });

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-known-enums' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'connection' },
  });

  const system = env.prompts[0].system;
  assert.match(system, /Allowed values \(closed\): wired \| wireless \| hybrid/);
  assert.match(system, /Passenger key: connectivity/);
  assert.match(system, /Preferred canonical values \(open_prefer_known\): 2\.4GHz Dongle \| Bluetooth/);
  assert.match(system, /Emit an unlisted value only when direct evidence proves a real value that none of the listed values can represent/);
  assert.doesNotMatch(system, /New values are allowed only when directly evidenced/);
});

test('preview prompt honors passenger_field_keys_snapshot from the UI bundle row', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-snapshot');

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-snapshot' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: {
      field_key: 'polling_rate',
      mode: 'loop',
      passenger_field_keys_snapshot: ['buttons'],
    },
  });

  assert.deepEqual(env.inputs_resolved.passenger_field_keys, ['buttons']);
  assert.equal(env.inputs_resolved.passenger_snapshot_source, 'ui_snapshot');
  assert.match(env.prompts[0].system, /Passenger key: buttons/);
  assert.doesNotMatch(env.prompts[0].system, /Passenger key: dpi/);
});

test('preview prompt honors an empty passenger_field_keys_snapshot as solo', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-empty-snapshot');

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-empty-snapshot' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: {
      field_key: 'polling_rate',
      mode: 'loop',
      passenger_field_keys_snapshot: [],
    },
  });

  assert.deepEqual(env.inputs_resolved.passenger_field_keys, []);
  assert.equal(env.inputs_resolved.passenger_snapshot_source, 'ui_snapshot');
  assert.doesNotMatch(env.prompts[0].system, /Passenger key:/);
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

  // Preview is always Loop-shape — always builds passengers regardless of
  // body.mode or settings.alwaysSoloRun. Direct buildPassengers call above
  // is the ground truth; preview must match it byte-for-byte.
  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-drift' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate' },
  });

  const directKeys = directPassengers.map((p) => p.fieldKey);
  assert.deepEqual(
    env.inputs_resolved.passenger_field_keys,
    directKeys,
    'preview must use same buildPassengers output as runtime — no drift allowed',
  );
});

test('drift guard: preview systemPrompt matches live Loop runner byte-for-byte', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-byte');

  // Preview is always Loop-shape — compare against a Loop-mode runKeyFinder
  // dispatch (which always packs passengers). A live Run dispatch under
  // alwaysSoloRun=true is intentionally solo; Run vs preview divergence is
  // the product contract (preview shows the "full potential bundle").
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
    mode: 'loop',
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

test('bundling ON: systemPrompt contains ADDITIONAL_FIELD_KEYS section when passengers present', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-adl-on');

  // Preview is always Loop-shape; mode param is informational only.
  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-adl-on' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate' },
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

test('always Loop-shape: preview packs passengers even with mode=run + alwaysSoloRun=true', async (t) => {
  t.after(cleanupTmp);
  // BUNDLING_ON omits alwaysSoloRun → defaults to true (same as real settings).
  const { specDb } = setup('kfp-always-loop');

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-always-loop' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate', mode: 'run' },
  });

  assert.ok(
    env.inputs_resolved.passenger_field_keys.length > 0,
    'preview must always show Loop-shape — passengers build regardless of body.mode or alwaysSoloRun',
  );
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

test('preview inputs resolve passenger variant surcharge from current settings and family size', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-variant-cost', {
    settings: {
      ...BUNDLING_ON,
      bundlingPassengerVariantCostPerExtra: '0.25',
      bundlingPoolPerPrimary: JSON.stringify({ easy: 3, medium: 3, hard: 3, very_hard: 3 }),
    },
    activeVariants: Array.from({ length: 9 }, (_, i) => ({ variant_id: `cef-${i}` })),
    productRows: [
      { product_id: 'kfp-variant-cost', brand: PRODUCT.brand, base_model: PRODUCT.base_model, model: PRODUCT.model, variant: PRODUCT.variant },
      { product_id: 'kfp-family-base', brand: PRODUCT.brand, base_model: PRODUCT.base_model, model: `${PRODUCT.base_model} Base`, variant: '' },
      { product_id: 'kfp-family-alt', brand: PRODUCT.brand, base_model: PRODUCT.base_model, model: `${PRODUCT.base_model} Alt`, variant: 'Alt' },
    ],
  });

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-variant-cost' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate' },
  });

  assert.equal(env.inputs_resolved.family_size, 3);
  assert.equal('variant_count' in env.inputs_resolved, false);
  assert.equal(env.inputs_resolved.bundling.passenger_variant_cost_per_extra, 0.25);
  assert.deepEqual(env.inputs_resolved.passenger_field_keys, ['dpi', 'buttons']);

  const userMessage = JSON.parse(env.prompts[0].user);
  assert.equal(userMessage.family_size, 3);
  assert.equal('variant_count' in userMessage, false);
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

// ─── passengerExclude* knobs wired from settings → preview ────────────
// Preview compiler reads the two exclude knobs and routes buildPassengers
// through the publisher's bucket evaluator at stricter thresholds. A peer
// whose bucket qualifies under 95/3 drops out of the preview's passenger
// list; the live run would make the same decision.
test('preview honors passengerExclude* via bucket evaluator', async (t) => {
  t.after(cleanupTmp);
  const { specDb } = setup('kfp-concrete', {
    settings: {
      ...BUNDLING_ON,
      passengerExcludeAtConfidence: '95',
      passengerExcludeMinEvidence: '3',
    },
    bucketsByFieldKey: {
      dpi: { top_confidence: 98, pooled_count: 4 }, // concrete — excluded
      buttons: { top_confidence: 80, pooled_count: 5 }, // below 95 — still packed
    },
  });

  const env = await compileKeyFinderPreviewPrompt({
    product: { ...PRODUCT, product_id: 'kfp-concrete' },
    specDb, appDb: null, config: {}, productRoot: PRODUCT_ROOT,
    body: { field_key: 'polling_rate', mode: 'loop' },
  });

  const passengers = env.inputs_resolved.passenger_field_keys;
  assert.ok(!passengers.includes('dpi'), 'dpi excluded: qualifies under 95/3 in the bucket evaluator');
  assert.ok(passengers.includes('buttons'), 'buttons packed: below 95 confidence in the bucket');
});
