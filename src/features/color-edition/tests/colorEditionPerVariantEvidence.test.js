/**
 * MACRO-RED boundary tests for per-variant CEF evidence.
 *
 * Contract under test:
 * - Discovery LLM returns per-item evidence (colors[{name, evidence_refs}],
 *   editions{<slug>:{evidence_refs}}).
 * - Each color atom and each edition becomes ONE field_candidates row with its
 *   own variant_id, scalar value, per-item evidence in metadata_json.
 * - Confidence = max per-source confidence for that variant's evidence_refs.
 * - Identity check (Run 2+) per-mapping evidence is unioned (by url+tier) with
 *   discovery evidence for the same variant.
 * - A source URL may legitimately appear on multiple variants — no cross-variant
 *   dedupe; each variant owns its own evidence list.
 * - On rerun under new code, any old-shape candidate rows for the product's
 *   colors/editions are cleaned up before the new rows are written.
 * - Variant delete removes only that variant's CEF candidate rows.
 * - product.json.fields.colors/editions remain derived from the variants table
 *   (via derivePublishedFromVariants), not from field_candidates.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { runColorEditionFinder } from '../colorEditionFinder.js';
import { deleteVariant } from '../variantLifecycle.js';
import { readColorEdition } from '../colorEditionStore.js';

const TMP_ROOT = path.join('.tmp', '_test_cef_per_variant_evidence');
const DB_DIR = path.join(TMP_ROOT, '_db');
const DB_PATH = path.join(DB_DIR, 'spec.sqlite');
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');
const TEST_CONFIG = { evidenceVerificationEnabled: false };

const REAL_COLORS_FIELD_RULE = {
  contract: {
    shape: 'list', type: 'string',
    list_rules: { dedupe: true, item_union: 'set_union', sort: 'none' },
  },
  parse: { template: 'list_of_tokens_delimited', delimiters: [',', '/', '|', ';'], token_map: {} },
  enum: { policy: 'closed', match: { strategy: 'exact' }, source: 'data_lists.colors' },
};

const REAL_COLORS_KNOWN_VALUES = {
  policy: 'closed',
  values: ['black', 'white', 'red', 'pink', 'purple', 'blue', 'silver', 'gray'],
};

const REAL_EDITIONS_FIELD_RULE = {
  contract: { shape: 'list', type: 'string' },
  parse: { template: null },
  enum: { policy: 'open', match: { strategy: 'exact' } },
  priority: {},
};

function makeAppDbStub() {
  return { listColors: () => REAL_COLORS_KNOWN_VALUES.values.map(n => ({ name: n, hex: '#000', css_var: `--${n}` })) };
}

function makeLlmStub(response) {
  return async () => ({ result: response, usage: null });
}

function seedCompiledRules(specDb) {
  specDb.upsertCompiledRules(JSON.stringify({
    fields: { colors: REAL_COLORS_FIELD_RULE, editions: REAL_EDITIONS_FIELD_RULE },
    known_values: { colors: REAL_COLORS_KNOWN_VALUES },
  }), JSON.stringify({}));
}

function ensureProductJson(productId) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({
    schema_version: 2, checkpoint_type: 'product', product_id: productId,
    category: 'mouse', identity: { brand: 'Razer', model: 'Viper' },
    sources: [], fields: {},
  }));
}

function readProductJson(productId) {
  try { return JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, productId, 'product.json'), 'utf8')); }
  catch { return null; }
}

const PRODUCT = {
  product_id: 'mouse-pv',
  category: 'mouse',
  brand: 'Razer',
  base_model: 'Viper',
  model: 'Viper V3 Pro',
  variant: '',
};

describe('CEF per-variant evidence (MACRO-RED)', () => {
  let specDb;
  let originalFetch;
  let networkFetchCalls;

  before(() => {
    originalFetch = globalThis.fetch;
    networkFetchCalls = [];
    globalThis.fetch = async (url) => {
      networkFetchCalls.push(String(url || ''));
      throw new Error('colorEditionPerVariantEvidence.test must not perform real network fetches');
    };
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    fs.mkdirSync(DB_DIR, { recursive: true });
    specDb = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
    seedCompiledRules(specDb);
  });

  after(() => {
    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }
    try {
      specDb.close();
      fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    } finally {
      assert.deepEqual(networkFetchCalls, [], 'offline CEF evidence tests must not perform URL verification fetches');
    }
  });

  it('discovery writes one field_candidates row per color with its own evidence', async () => {
    const pid = 'mouse-colors-per-variant';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: TEST_CONFIG,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', confidence: 85, evidence_refs: [
            { url: 'https://razer.com/viper-v3-pro', tier: 'tier1', confidence: 95 },
            { url: 'https://bestbuy.com/viper', tier: 'tier3', confidence: 70 },
          ]},
          { name: 'white', confidence: 72, evidence_refs: [
            { url: 'https://razer.com/viper-v3-pro', tier: 'tier1', confidence: 90 },
          ]},
        ],
        editions: {},
        default_color: 'black',
      }),
    });

    assert.equal(result.rejected, false, 'run accepted');

    const rows = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    assert.equal(rows.length, 2, 'one row per color variant');

    // Each row has variant_id set and a single-item value array (the one atom this row represents)
    for (const r of rows) {
      assert.ok(r.variant_id, `row has variant_id (value=${r.value})`);
      const parsed = JSON.parse(r.value);
      assert.ok(Array.isArray(parsed) && parsed.length === 1,
        `row value is single-item array, got ${r.value}`);
    }

    const byValue = new Map(rows.map(r => [JSON.parse(r.value)[0], r]));

    // Black row carries its own 2 evidence refs
    const black = byValue.get('black');
    assert.ok(black, 'black row exists');
    const blackEvidence = Array.isArray(black.metadata_json?.evidence_refs)
      ? black.metadata_json.evidence_refs : [];
    assert.equal(blackEvidence.length, 2, 'black has 2 evidence refs');
    const blackUrls = new Set(blackEvidence.map(e => e.url));
    assert.ok(blackUrls.has('https://razer.com/viper-v3-pro'), 'black includes razer');
    assert.ok(blackUrls.has('https://bestbuy.com/viper'), 'black includes bestbuy');
    // Confidence = LLM's item-level overall confidence (85), NOT max(per-source)=95
    assert.equal(black.confidence, 85, 'black confidence = LLM item-level, not max(per-source)');

    // White row carries its own 1 evidence ref
    const white = byValue.get('white');
    assert.ok(white, 'white row exists');
    const whiteEvidence = Array.isArray(white.metadata_json?.evidence_refs)
      ? white.metadata_json.evidence_refs : [];
    assert.equal(whiteEvidence.length, 1, 'white has 1 evidence ref');
    assert.equal(whiteEvidence[0].url, 'https://razer.com/viper-v3-pro');
    // White shows the LLM's item-level call even when its per-source is higher
    assert.equal(white.confidence, 72, 'white confidence = LLM item-level (72), not per-source (90)');
  });

  it('editions write one field_candidates row per edition with its own evidence', async () => {
    const pid = 'mouse-editions-per-variant';
    ensureProductJson(pid);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: TEST_CONFIG,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', confidence: 80, evidence_refs: [{ url: 'https://razer.com/black', tier: 'tier1', confidence: 80 }] },
        ],
        editions: {
          'doom-edition': {
            display_name: 'DOOM Edition',
            colors: ['black+red'],
            confidence: 88,
            evidence_refs: [
              { url: 'https://razer.com/doom', tier: 'tier1', confidence: 92 },
            ],
          },
        },
        default_color: 'black',
      }),
    });

    const editionRows = specDb.getFieldCandidatesByProductAndField(pid, 'editions');
    assert.equal(editionRows.length, 1, 'one edition row');
    const doom = editionRows[0];
    assert.ok(doom.variant_id, 'edition row has variant_id');
    const doomValue = JSON.parse(doom.value);
    assert.deepEqual(doomValue, ['doom-edition'], 'edition value wraps slug');
    const doomEvidence = doom.metadata_json?.evidence_refs || [];
    assert.equal(doomEvidence.length, 1, 'edition has its own 1 evidence ref');
    assert.equal(doomEvidence[0].url, 'https://razer.com/doom');
    // Edition confidence = LLM's item-level call (88), NOT max(per-source)=92
    assert.equal(doom.confidence, 88, 'edition confidence = LLM item-level, not max(per-source)');

    // Edition's combo also appears as a colors candidate (for grid rendering)
    const colorRows = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    const comboRow = colorRows.find(r => JSON.parse(r.value)[0] === 'black+red');
    assert.ok(comboRow, 'edition combo appears as colors candidate');
    assert.ok(comboRow.variant_id, 'combo row has variant_id');
    assert.equal(comboRow.variant_id, doom.variant_id,
      'combo row shares variant_id with edition row (same variant)');
    const comboEvidence = comboRow.metadata_json?.evidence_refs || [];
    assert.equal(comboEvidence.length, 1, 'combo carries edition evidence');
    assert.equal(comboEvidence[0].url, 'https://razer.com/doom');
  });

  it('identity check evidence unions with discovery evidence per variant', async () => {
    const pid = 'mouse-evidence-union';
    ensureProductJson(pid);

    // Run 1: discovery establishes registry with evidence E1 for black
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: TEST_CONFIG,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', confidence: 78, evidence_refs: [{ url: 'https://razer.com/black', tier: 'tier1', confidence: 80 }] },
        ],
        editions: {},
        default_color: 'black',
      }),
    });

    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    const blackId = afterRun1.variant_registry.find(e => e.variant_key === 'color:black').variant_id;

    // Run 2: identity check adds evidence E2 and its OWN overall confidence
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: TEST_CONFIG,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', confidence: 83, evidence_refs: [{ url: 'https://razer.com/black', tier: 'tier1', confidence: 85 }] },
        ],
        editions: {},
        default_color: 'black',
      }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: [
          {
            new_key: 'color:black',
            match: blackId,
            action: 'match',
            reason: 'confirmed',
            verified: true,
            // Identity checker is the authoritative confidence source on Run 2+
            // (more context than discovery). Its 92 wins over discovery's 83.
            confidence: 92,
            evidence_refs: [
              { url: 'https://engadget.com/razer-viper-review', tier: 'tier3', confidence: 75 },
            ],
          },
        ],
        remove: [],
      }),
    });

    const rows = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    const blackRow = rows.find(r => r.variant_id === blackId);
    assert.ok(blackRow, 'black row exists after run 2');

    const refs = blackRow.metadata_json?.evidence_refs || [];
    const urls = new Set(refs.map(e => e.url));
    assert.ok(urls.has('https://razer.com/black'), 'discovery evidence preserved');
    assert.ok(urls.has('https://engadget.com/razer-viper-review'), 'identity-check evidence merged');
    assert.equal(refs.length, 2, 'exactly 2 refs after union (no dupes)');

    // Identity's overall confidence (92) wins over discovery's (83) on Run 2+
    assert.equal(blackRow.confidence, 92, 'identity-mapping confidence wins on Run 2+');
  });

  it('shared source URL across variants is allowed (no cross-variant dedupe)', async () => {
    const pid = 'mouse-shared-source';
    ensureProductJson(pid);

    const sharedUrl = 'https://razer.com/viper-product-page';

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: TEST_CONFIG,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', evidence_refs: [{ url: sharedUrl, tier: 'tier1', confidence: 90 }] },
          { name: 'white', evidence_refs: [{ url: sharedUrl, tier: 'tier1', confidence: 90 }] },
        ],
        editions: {},
        default_color: 'black',
      }),
    });

    const rows = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    assert.equal(rows.length, 2, 'two rows, one per variant');
    for (const r of rows) {
      const refs = r.metadata_json?.evidence_refs || [];
      const urls = refs.map(e => e.url);
      assert.ok(urls.includes(sharedUrl),
        `variant ${r.value} carries the shared URL in its own evidence`);
    }
  });

  it('clean break on rerun: old-shape row deleted before new rows written', async () => {
    const pid = 'mouse-cleanbreak';
    ensureProductJson(pid);

    // Pre-seed DB with an old-shape row (one candidate with array value, no variant_id)
    specDb.insertFieldCandidate({
      category: 'mouse',
      productId: pid,
      fieldKey: 'colors',
      sourceId: 'cef-legacy-0',
      sourceType: 'cef',
      value: JSON.stringify(['black', 'white']),
      unit: null,
      confidence: 100,
      model: 'legacy',
      validationJson: null,
      metadataJson: { evidence_refs: [{ url: 'https://old', tier: 'tier5', confidence: 50 }] },
      variantId: null,
    });

    // Verify old-shape row is there before run
    const pre = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    assert.equal(pre.length, 1, 'legacy row seeded');
    assert.equal(pre[0].variant_id, null, 'legacy row has null variant_id');

    // Now run CEF with new-shape data
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: TEST_CONFIG,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', evidence_refs: [{ url: 'https://razer.com', tier: 'tier1', confidence: 90 }] },
          { name: 'red', evidence_refs: [{ url: 'https://razer.com', tier: 'tier1', confidence: 90 }] },
        ],
        editions: {},
        default_color: 'black',
      }),
    });

    const post = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    // Old-shape row removed, new per-variant rows present
    assert.equal(post.length, 2, 'only new rows remain');
    for (const r of post) {
      assert.ok(r.variant_id, 'no null-variant_id rows');
      const parsed = JSON.parse(r.value);
      assert.equal(parsed.length, 1, 'each row is single-item array');
    }
  });

  it('variant delete cascades CEF candidate rows for that variant only', async () => {
    const pid = 'mouse-vdel';
    ensureProductJson(pid);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: TEST_CONFIG,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', evidence_refs: [{ url: 'https://razer.com/b', tier: 'tier1', confidence: 90 }] },
          { name: 'white', evidence_refs: [{ url: 'https://razer.com/w', tier: 'tier1', confidence: 90 }] },
        ],
        editions: {},
        default_color: 'black',
      }),
    });

    const data = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    const blackId = data.variant_registry.find(e => e.variant_key === 'color:black').variant_id;

    deleteVariant({ specDb, productId: pid, variantId: blackId, productRoot: PRODUCT_ROOT });

    const rows = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    // White remains, black gone
    assert.equal(rows.length, 1, 'only the non-deleted variant remains');
    assert.deepEqual(JSON.parse(rows[0].value), ['white'], 'white row preserved');
    assert.notEqual(rows[0].variant_id, blackId, 'black row removed');
  });

  it('derivePublishedFromVariants still drives product.json.fields.colors/editions', async () => {
    const pid = 'mouse-derived';
    ensureProductJson(pid);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: TEST_CONFIG,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', evidence_refs: [{ url: 'https://x', tier: 'tier1', confidence: 90 }] },
          { name: 'white', evidence_refs: [{ url: 'https://x', tier: 'tier1', confidence: 90 }] },
        ],
        editions: {
          'doom-edition': {
            display_name: 'DOOM Edition',
            colors: ['black+red'],
            evidence_refs: [{ url: 'https://y', tier: 'tier1', confidence: 90 }],
          },
        },
        default_color: 'black',
      }),
    });

    const pj = readProductJson(pid);
    // Published colors/editions come from the variants-table projection (source='variant_registry')
    const colorsField = pj?.fields?.colors;
    const editionsField = pj?.fields?.editions;
    assert.equal(colorsField?.source, 'variant_registry', 'colors field sourced from variants');
    assert.ok(Array.isArray(colorsField?.value), 'colors field value is array');
    assert.ok(colorsField.value.includes('black'), 'black published');
    assert.ok(colorsField.value.includes('white'), 'white published');
    assert.ok(colorsField.value.includes('black+red'), 'edition combo published in colors');
    assert.equal(editionsField?.source, 'variant_registry', 'editions field sourced from variants');
    assert.ok(Array.isArray(editionsField?.value), 'editions field value is array');
    assert.ok(editionsField.value.includes('doom-edition'), 'edition slug published');
  });
});
