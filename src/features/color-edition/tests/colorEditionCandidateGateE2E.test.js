/**
 * E2E proof: CEF → candidate gate → field_candidates + product.json candidates[]
 *
 * Uses REAL field rules and known values from the category authority.
 * Proves that a realistic CEF LLM response lands correctly in both
 * the DB projection and the durable JSON SSOT under the per-variant shape.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { runColorEditionFinder } from '../colorEditionFinder.js';

const TMP_ROOT = path.join('.tmp', '_test_cef_gate_e2e');
const DB_DIR = path.join(TMP_ROOT, '_db');
const DB_PATH = path.join(DB_DIR, 'spec.sqlite');
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

// Real field rules for colors — from category_authority/mouse/_generated/field_rules.json
const REAL_COLORS_FIELD_RULE = {
  contract: {
    shape: 'list', type: 'string',
    list_rules: { dedupe: true, item_union: 'set_union', sort: 'none' },
  },
  parse: {
    template: 'list_of_tokens_delimited',
    delimiters: [',', '/', '|', ';'],
    token_map: {
      'blue-dark': 'dark-blue', 'blue-light': 'light-blue',
      'dark blue': 'dark-blue', 'dark green': 'dark-green', 'dark red': 'dark-red',
      'gray-light': 'light-gray', 'green-dark': 'dark-green', 'green-light': 'light-green',
      'grey': 'gray', 'light blue': 'light-blue', 'light gray': 'light-gray',
      'light green': 'light-green', 'light grey': 'light-gray', 'light pink': 'light-pink',
      'light red': 'light-red', 'pink-light': 'light-pink', 'red-dark': 'dark-red', 'red-light': 'light-red',
    },
  },
  enum: { policy: 'closed', match: { strategy: 'exact' }, source: 'data_lists.colors' },
};

// Real known_values for colors — subset of actual registered colors
const REAL_COLORS_KNOWN_VALUES = {
  policy: 'closed',
  values: [
    'amber', 'beige', 'black', 'blue', 'brown', 'coral', 'cyan',
    'dark-blue', 'dark-gray', 'dark-green', 'dark-red',
    'emerald', 'fuchsia', 'gold', 'gray', 'green', 'indigo', 'ivory',
    'lavender', 'light-blue', 'light-gray', 'light-green', 'light-pink',
    'lime', 'magenta', 'maroon', 'navy', 'olive', 'orange', 'pink',
    'purple', 'red', 'rose', 'salmon', 'silver', 'sky', 'slate',
    'teal', 'turquoise', 'violet', 'white', 'yellow',
  ],
};

function makeAppDbStub() {
  return { listColors: () => REAL_COLORS_KNOWN_VALUES.values.map(n => ({ name: n, hex: '#000', css_var: `--${n}` })) };
}

function makeLlmStub(response) {
  return async () => ({ result: response, usage: null });
}

const REAL_EDITIONS_FIELD_RULE = {
  contract: { shape: 'list', type: 'string' },
  parse: { template: null },
  enum: { policy: 'open', match: { strategy: 'exact' } },
  priority: {},
};

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

// Per-item evidence helper — keeps test stubs tidy.
function ev(url, tier = 'tier1', confidence = 90) {
  return { url, tier, confidence };
}

const PRODUCT = {
  product_id: 'mouse-e2e',
  category: 'mouse',
  brand: 'Razer',
  base_model: 'Viper',
  model: 'Viper V3 Pro',
  variant: '',
};

describe('CEF → candidate gate E2E (real field rules)', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(DB_DIR, { recursive: true });
    specDb = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
    seedCompiledRules(specDb);
  });

  after(() => {
    specDb.close();
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it('realistic CEF output → accepted → per-variant rows written to DB + JSON', async () => {
    const pid = 'mouse-viper-e2e';
    ensureProductJson(pid);

    // Razer Viper — each colorway carries its own evidence (shared URL allowed when it covers all)
    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: { llmModelPlan: 'gemini-2.5-flash' },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', evidence_refs: [ev('https://razer.com/viper-v3-pro')] },
          { name: 'white', evidence_refs: [ev('https://razer.com/viper-v3-pro')] },
          { name: 'pink', evidence_refs: [ev('https://razer.com/viper-v3-pro')] },
          { name: 'red', evidence_refs: [ev('https://razer.com/viper-v3-pro')] },
          { name: 'purple', evidence_refs: [ev('https://razer.com/viper-v3-pro')] },
          { name: 'black+red', evidence_refs: [ev('https://razer.com/viper-cp')] },
        ],
        editions: {
          'cyberpunk-2077-edition': {
            display_name: 'Cyberpunk 2077 Edition',
            colors: ['black+red'],
            evidence_refs: [ev('https://razer.com/viper-cp')],
          },
        },
        default_color: 'black',
      }),
    });

    assert.equal(result.rejected, false, 'should be accepted');
    assert.ok(result.colors.includes('black'));
    assert.ok(result.colors.includes('white'));
    assert.ok(result.colors.includes('black+red'), 'edition combo cascades into result colors');

    // --- DB: per-variant field_candidates rows ---
    const colorRows = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    // 5 standalone colors + 1 edition combo (variant row under 'colors' for the combo) = 6
    assert.equal(colorRows.length, 6, 'six per-variant color rows');
    for (const r of colorRows) {
      assert.ok(r.variant_id, 'each row has variant_id set');
      assert.equal(r.source_type, 'cef');
      const parsed = JSON.parse(r.value);
      assert.equal(parsed.length, 1, 'each row is single-item array');
    }
    const colorValues = colorRows.map(r => JSON.parse(r.value)[0]);
    assert.ok(colorValues.includes('black'));
    assert.ok(colorValues.includes('black+red'), 'edition combo is its own row under colors');

    // Editions field — one row per edition
    const editionRows = specDb.getFieldCandidatesByProductAndField(pid, 'editions');
    assert.equal(editionRows.length, 1, 'one edition row');
    assert.deepEqual(JSON.parse(editionRows[0].value), ['cyberpunk-2077-edition']);

    // --- JSON: product.json candidates[] mirror ---
    const pj = readProductJson(pid);
    assert.ok(pj.candidates?.colors, 'colors candidates exist');
    assert.equal(pj.candidates.colors.length, 6, 'six candidate entries in JSON mirror');
    for (const entry of pj.candidates.colors) {
      assert.ok(entry.variant_id, 'candidate entry carries variant_id');
    }

    // --- CEF summary table populated from variants ---
    const cefRow = specDb.getColorEditionFinder(pid);
    assert.ok(cefRow);
    assert.ok(cefRow.colors.includes('black'));
    assert.ok(cefRow.colors.includes('black+red'));
  });

  it('CEF output with case repairs → repaired values in all targets', async () => {
    const pid = 'mouse-casefix';
    ensureProductJson(pid);

    // Uppercase "Black", "White" should be normalized to lowercase by template dispatch
    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: { llmModelPlan: 'gemini-2.5-flash' },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'Black', evidence_refs: [ev('https://razer.com/b')] },
          { name: 'White', evidence_refs: [ev('https://razer.com/w')] },
        ],
        editions: {},
        default_color: 'Black',
      }),
    });

    assert.equal(result.rejected, false);
    assert.ok(result.colors.includes('black'), 'Black repaired to black');
    assert.ok(result.colors.includes('white'), 'White repaired to white');

    // DB rows carry the repaired value
    const rows = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    const values = rows.map(r => JSON.parse(r.value)[0]);
    assert.ok(values.includes('black'), 'DB has black (repaired)');
    assert.ok(values.includes('white'));
    // None retain the uppercase form
    assert.ok(!values.includes('Black'));

    // CEF summary reflects repair
    const cefRow = specDb.getColorEditionFinder(pid);
    assert.ok(cefRow.colors.includes('black'));
  });

  it('invalid color in closed enum → entire run rejected, no candidates', async () => {
    const pid = 'mouse-invalid-e2e';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', evidence_refs: [ev('https://razer.com/b')] },
          { name: 'cosmic-twilight-shimmer', evidence_refs: [ev('https://fake')] },
        ],
        editions: {},
        default_color: 'black',
      }),
    });

    assert.equal(result.rejected, true, 'should be rejected');

    const dbCandidates = specDb.getAllFieldCandidatesByProduct(pid);
    assert.equal(dbCandidates.length, 0, 'no candidates written');

    const cefRow = specDb.getColorEditionFinder(pid);
    assert.ok(cefRow, 'summary row exists after rejected run');
    assert.deepEqual(cefRow.colors, [], 'no valid colors from rejected run');
    assert.equal(cefRow.run_count, 1, 'rejected run counted');

    const pj = readProductJson(pid);
    assert.ok(!pj.candidates || !pj.candidates.colors, 'no candidates in product.json');
  });

  it('Gate 2 rejection must not leave orphaned candidates from that run', async () => {
    const pid = 'mouse-gate2-leak';
    ensureProductJson(pid);

    // Run 1: establish registry with basic colors
    const run1Result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', evidence_refs: [ev('https://razer.com/b')] },
          { name: 'white', evidence_refs: [ev('https://razer.com/w')] },
        ],
        editions: {},
        default_color: 'black',
      }),
    });
    assert.equal(run1Result.rejected, false, 'Run 1 accepted');

    const run1ColorCount = specDb.getFieldCandidatesByProductAndField(pid, 'colors').length;
    const run1EditionCount = specDb.getFieldCandidatesByProductAndField(pid, 'editions').length;

    const { readColorEdition } = await import('../colorEditionStore.js');
    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    const blackId = afterRun1.variant_registry.find(e => e.variant_key === 'color:black')?.variant_id;

    // Run 2: Gate 2 rejects (duplicate match target)
    const run2Result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', evidence_refs: [ev('https://razer.com/b2')] },
          { name: 'white', evidence_refs: [ev('https://razer.com/w2')] },
          { name: 'red', evidence_refs: [ev('https://razer.com/r')] },
        ],
        editions: {
          'doom-edition': { display_name: 'DOOM Edition', colors: ['black+red'], evidence_refs: [ev('https://razer.com/doom')] },
        },
        default_color: 'black',
      }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: [
          { new_key: 'color:black', match: blackId, action: 'match', reason: 'same' },
          { new_key: 'color:white', match: blackId, action: 'match', reason: 'also same?' }, // duplicate match target
          { new_key: 'color:red', match: null, action: 'new', reason: 'new' },
          { new_key: 'edition:doom-edition', match: null, action: 'new', reason: 'new' },
        ],
        remove: [],
      }),
    });

    assert.equal(run2Result.rejected, true, 'Run 2 must be rejected (duplicate match)');

    // Candidates from Run 1 remain untouched — Run 2 writes nothing.
    assert.equal(specDb.getFieldCandidatesByProductAndField(pid, 'colors').length, run1ColorCount,
      'color candidates unchanged after rejected run');
    assert.equal(specDb.getFieldCandidatesByProductAndField(pid, 'editions').length, run1EditionCount,
      'edition candidates unchanged after rejected run');
  });

  it('multi-color atom (black+red) passes validation as its own variant row', async () => {
    const pid = 'mouse-multi-atom';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [
          { name: 'black', evidence_refs: [ev('https://x')] },
          { name: 'white', evidence_refs: [ev('https://x')] },
          { name: 'black+red', evidence_refs: [ev('https://x')] },
        ],
        editions: {},
        default_color: 'black',
      }),
    });

    assert.equal(result.rejected, false);
    assert.ok(result.colors.includes('black+red'), 'multi-atom preserved');

    const rows = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    assert.equal(rows.length, 3, 'one row per color variant, combos included');
    const values = rows.map(r => JSON.parse(r.value)[0]);
    assert.ok(values.includes('black+red'));
  });
});
