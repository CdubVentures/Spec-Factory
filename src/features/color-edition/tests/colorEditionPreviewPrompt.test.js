/**
 * CEF Prompt Preview — byte-identical parity with real-run snapshot.
 *
 * The preview endpoint compiles the exact same prompt the next run would
 * dispatch. This test drives fixture-seeded state through BOTH paths and
 * asserts they produce byte-identical system/user output. Any drift here
 * means the preview is lying to the user.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { runColorEditionFinder } from '../colorEditionFinder.js';
import { compileColorEditionPreviewPrompt } from '../colorEditionPreviewPrompt.js';

const TMP_ROOT = path.join('.tmp', '_test_cef_preview_prompt');
const DB_DIR = path.join(TMP_ROOT, '_db');
const DB_PATH = path.join(DB_DIR, 'spec.sqlite');
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

const COLORS_RULE = {
  contract: { shape: 'list', type: 'string', list_rules: { dedupe: true, item_union: 'set_union', sort: 'none' } },
  parse: { template: 'list_of_tokens_delimited', delimiters: [',', '/', '|', ';'], token_map: {} },
  enum: { policy: 'closed', match: { strategy: 'exact' }, source: 'data_lists.colors' },
};
const EDITIONS_RULE = { contract: { shape: 'list', type: 'string' }, parse: { template: null }, enum: { policy: 'open', match: { strategy: 'exact' } }, priority: {} };

function seedRules(specDb) {
  specDb.upsertCompiledRules(JSON.stringify({
    fields: { colors: COLORS_RULE, editions: EDITIONS_RULE },
    known_values: { colors: { policy: 'closed', values: ['black', 'white'] } },
  }), JSON.stringify({}));
}

function seedFamily(specDb) {
  specDb.upsertProduct({ product_id: 'mouse-target', category: 'mouse', brand: 'Corsair', base_model: 'M75', model: 'M75 Air Wireless', variant: 'Air Wireless', status: 'active' });
  specDb.upsertProduct({ product_id: 'mouse-sib-1', category: 'mouse', brand: 'Corsair', base_model: 'M75', model: 'M75', variant: '', status: 'active' });
  specDb.upsertProduct({ product_id: 'mouse-sib-2', category: 'mouse', brand: 'Corsair', base_model: 'M75', model: 'M75 Wireless', variant: 'Wireless', status: 'active' });
}

function ensureProductJson(productId) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({
    schema_version: 2, checkpoint_type: 'product', product_id: productId,
    category: 'mouse',
    identity: { brand: 'Corsair', base_model: 'M75', model: 'M75 Air Wireless', variant: 'Air Wireless' },
    sources: [], fields: {},
  }));
}

const appDb = { listColors: () => [
  { name: 'black', hex: '#000', css_var: '--black' },
  { name: 'white', hex: '#fff', css_var: '--white' },
  { name: 'gray', hex: '#888', css_var: '--gray' },
] };

const LLM_RESPONSE = {
  colors: [{ name: 'black', confidence: 85, evidence_refs: [{ url: 'https://corsair.com/x', tier: 'tier1', confidence: 90 }] }],
  editions: {},
  default_color: 'black',
  siblings_excluded: [],
  discovery_log: { confirmed_from_known: [], added_new: ['black'], rejected_from_known: [], urls_checked: ['https://corsair.com/x'], queries_run: ['corsair m75 air colors'] },
};

const PRODUCT = { product_id: 'mouse-target', category: 'mouse', brand: 'Corsair', base_model: 'M75', model: 'M75 Air Wireless', variant: 'Air Wireless' };

describe('CEF prompt preview — parity with real-run snapshot', () => {
  let specDb;

  before(() => {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    fs.mkdirSync(DB_DIR, { recursive: true });
    specDb = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
    seedRules(specDb);
    seedFamily(specDb);
    ensureProductJson('mouse-target');
  });

  after(() => {
    specDb.close();
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it('preview system + user match the captured real-run snapshot byte-for-byte', async () => {
    // Preview first (no side effects)
    const preview = await compileColorEditionPreviewPrompt({
      product: PRODUCT, appDb, specDb, config: {}, productRoot: PRODUCT_ROOT,
    });
    assert.equal(preview.finder, 'cef');
    assert.equal(preview.mode, 'run');
    assert.equal(preview.prompts.length, 1);

    // Real run next — capture the snapshot via onLlmCallComplete
    const capturedCalls = [];
    await runColorEditionFinder({
      product: PRODUCT, appDb, specDb, config: {}, productRoot: PRODUCT_ROOT,
      onLlmCallComplete: (call) => capturedCalls.push(call),
      _callLlmOverride: async () => ({ result: LLM_RESPONSE, usage: null }),
    });

    const discoveryCall = capturedCalls.find((c) => c.label === 'Discovery');
    assert.ok(discoveryCall, 'expected a Discovery-labeled onLlmCallComplete');

    assert.equal(preview.prompts[0].system, discoveryCall.prompt.system,
      'preview system prompt must match real-run Discovery system byte-for-byte');
    assert.equal(preview.prompts[0].user, discoveryCall.prompt.user,
      'preview user message must match real-run Discovery user byte-for-byte');
  });

  it('preview writes nothing to SQL / JSON / operations', async () => {
    const cleanDb = new SpecDb({ dbPath: path.join(DB_DIR, 'clean.sqlite'), category: 'mouse' });
    try {
      seedRules(cleanDb);
      seedFamily(cleanDb);
      const cleanRoot = path.join(TMP_ROOT, 'clean-products');
      fs.mkdirSync(path.join(cleanRoot, 'mouse-target'), { recursive: true });
      fs.writeFileSync(path.join(cleanRoot, 'mouse-target', 'product.json'),
        JSON.stringify({ schema_version: 2, checkpoint_type: 'product', product_id: 'mouse-target', category: 'mouse', identity: { brand: 'Corsair', base_model: 'M75', model: 'M75 Air Wireless', variant: 'Air Wireless' }, sources: [], fields: {} }),
        { flag: 'w' });

      const cefRowBefore = cleanDb.getFinderStore('colorEditionFinder').get('mouse-target');
      const runsBefore = cleanDb.getFinderStore('colorEditionFinder').listRuns('mouse-target');
      const jsonBefore = fs.existsSync(path.join(cleanRoot, 'mouse-target', 'color_edition.json'));

      await compileColorEditionPreviewPrompt({
        product: PRODUCT, appDb, specDb: cleanDb, config: {}, productRoot: cleanRoot,
      });

      const cefRowAfter = cleanDb.getFinderStore('colorEditionFinder').get('mouse-target');
      const runsAfter = cleanDb.getFinderStore('colorEditionFinder').listRuns('mouse-target');
      const jsonAfter = fs.existsSync(path.join(cleanRoot, 'mouse-target', 'color_edition.json'));

      assert.deepEqual(cefRowAfter, cefRowBefore, 'SQL summary row unchanged');
      assert.deepEqual(runsAfter, runsBefore, 'SQL runs table unchanged');
      assert.equal(jsonAfter, jsonBefore, 'color_edition.json creation state unchanged');
    } finally {
      cleanDb.close();
    }
  });

  it('model.json_strict reflects config._resolvedColorFinderJsonStrict', async () => {
    // Fresh SpecDb so the previous test's runs don't leak in as previousRuns
    const isoDb = new SpecDb({ dbPath: path.join(DB_DIR, 'iso.sqlite'), category: 'mouse' });
    try {
      seedRules(isoDb);
      seedFamily(isoDb);

      const previewStrictOff = await compileColorEditionPreviewPrompt({
        product: PRODUCT, appDb, specDb: isoDb,
        config: { _resolvedColorFinderJsonStrict: false },
        productRoot: PRODUCT_ROOT,
      });
      assert.equal(previewStrictOff.prompts[0].model.json_strict, false);

      const previewStrictOn = await compileColorEditionPreviewPrompt({
        product: PRODUCT, appDb, specDb: isoDb,
        config: { _resolvedColorFinderJsonStrict: true },
        productRoot: PRODUCT_ROOT,
      });
      assert.equal(previewStrictOn.prompts[0].model.json_strict, true);

      // Default (omitted) → true
      const previewDefault = await compileColorEditionPreviewPrompt({
        product: PRODUCT, appDb, specDb: isoDb, config: {}, productRoot: PRODUCT_ROOT,
      });
      assert.equal(previewDefault.prompts[0].model.json_strict, true);
    } finally {
      isoDb.close();
    }
  });
});
