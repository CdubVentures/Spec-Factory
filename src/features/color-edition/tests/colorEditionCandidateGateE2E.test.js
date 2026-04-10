/**
 * E2E proof: CEF → candidate gate → field_candidates + product.json candidates[]
 *
 * Uses REAL field rules and known values from the category authority.
 * Proves that a realistic CEF LLM response lands correctly in both
 * the DB projection and the durable JSON SSOT.
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
  return async () => response;
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

  it('realistic CEF output → accepted → dual-written to DB + JSON', async () => {
    const pid = 'mouse-viper-e2e';
    ensureProductJson(pid);

    // Realistic Razer Viper color response
    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: { llmModelPlan: 'gemini-2.5-flash' },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white', 'pink', 'red', 'purple'],
        editions: { 'cyberpunk-2077-edition': { colors: ['black'] } },
        default_color: 'black',
      }),
    });

    // --- Acceptance ---
    assert.equal(result.rejected, false, 'should be accepted');
    assert.deepEqual(result.colors, ['black', 'white', 'pink', 'red', 'purple']);

    // --- DB: field_candidates row exists ---
    const dbCandidates = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    assert.equal(dbCandidates.length, 1, 'one candidate row for colors');
    assert.ok(dbCandidates[0].sources_json.length > 0, 'sources populated');
    assert.equal(dbCandidates[0].sources_json[0].source, 'cef');
    assert.equal(dbCandidates[0].sources_json[0].model, 'gemini-2.5-flash');
    assert.ok(dbCandidates[0].validation_json.valid === true, 'validation passed');

    // --- JSON: product.json candidates[] exists ---
    const pj = readProductJson(pid);
    assert.ok(pj.candidates, 'candidates key exists');
    assert.ok(pj.candidates.colors, 'colors candidates exist');
    assert.equal(pj.candidates.colors.length, 1, 'one candidate entry');
    assert.deepEqual(pj.candidates.colors[0].value, ['black', 'white', 'pink', 'red', 'purple']);
    assert.ok(pj.candidates.colors[0].validation, 'validation record present');
    assert.ok(pj.candidates.colors[0].sources.length > 0, 'sources present in JSON');

    // --- CEF's own tables also populated ---
    const cefRow = specDb.getColorEditionFinder(pid);
    assert.ok(cefRow, 'CEF summary row exists');
    assert.deepEqual(cefRow.colors, ['black', 'white', 'pink', 'red', 'purple']);
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
        colors: ['Black', 'White'],
        editions: {},
        default_color: 'Black',
      }),
    });

    assert.equal(result.rejected, false);
    assert.ok(result.colors.includes('black'), 'Black repaired to black');
    assert.ok(result.colors.includes('white'), 'White repaired to white');

    // DB has repaired value
    const dbCandidates = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    const dbValue = JSON.parse(dbCandidates[0].value);
    assert.ok(dbValue.includes('black'), 'DB has black (repaired)');

    // CEF tables have repaired value
    const cefRow = specDb.getColorEditionFinder(pid);
    assert.ok(cefRow.colors.includes('black'), 'CEF summary has black (repaired)');
  });

  it('invalid color in closed enum → entire run rejected', async () => {
    const pid = 'mouse-invalid-e2e';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'cosmic-twilight-shimmer'], // not in registered colors
        editions: {},
        default_color: 'black',
      }),
    });

    assert.equal(result.rejected, true, 'should be rejected');

    // No candidates
    const dbCandidates = specDb.getAllFieldCandidatesByProduct(pid);
    assert.equal(dbCandidates.length, 0, 'no candidates written');

    // CEF summary exists but with empty colors (rejected run counted)
    const cefRow = specDb.getColorEditionFinder(pid);
    assert.ok(cefRow, 'summary row exists after rejected run');
    assert.deepEqual(cefRow.colors, [], 'no valid colors from rejected run');
    assert.equal(cefRow.run_count, 1, 'rejected run counted');

    // product.json unchanged (no candidates key added)
    const pj = readProductJson(pid);
    assert.ok(!pj.candidates || !pj.candidates.colors, 'no candidates in product.json');
  });

  it('multi-color atom (black+red) passes validation', async () => {
    const pid = 'mouse-multi-atom';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white', 'black+red'],
        editions: {},
        default_color: 'black',
      }),
    });

    assert.equal(result.rejected, false);
    assert.ok(result.colors.includes('black+red'), 'multi-atom preserved');

    const dbCandidates = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    assert.equal(dbCandidates.length, 1);
  });
});
