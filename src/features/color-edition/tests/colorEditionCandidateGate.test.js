/**
 * Integration test: CEF orchestrator + candidate gate.
 * Proves the all-or-nothing gate: validate colors before CEF writes.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { runColorEditionFinder } from '../colorEditionFinder.js';
import { readColorEdition } from '../colorEditionStore.js';

const TMP_ROOT = path.join('.tmp', '_test_cef_gate');
const DB_DIR = path.join(TMP_ROOT, '_db');
const DB_PATH = path.join(DB_DIR, 'spec.sqlite');
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

function makeAppDbStub(colors = []) {
  const registry = new Map(colors.map(c => [c.name, c]));
  return { listColors: () => [...registry.values()] };
}

function makeLlmStub(response) {
  return async () => ({ result: response, usage: null });
}

const REGISTERED_COLORS = [
  { name: 'black', hex: '#000000', css_var: '--color-black' },
  { name: 'white', hex: '#ffffff', css_var: '--color-white' },
  { name: 'red', hex: '#ff0000', css_var: '--color-red' },
];

const PRODUCT = {
  product_id: 'mouse-gate',
  category: 'mouse',
  brand: 'Razer',
  base_model: 'Viper',
  model: 'Viper',
  variant: '',
};

function seedCompiledRules(specDb) {
  // Seed the compiled rules so the candidate gate activates
  const compiledRules = {
    fields: {
      colors: {
        contract: {
          shape: 'list', type: 'string',
          list_rules: { dedupe: true, sort: 'none' },
        },
        parse: { template: 'list_of_tokens_delimited' },
        enum: { policy: 'closed', match: { strategy: 'exact' } },
        priority: {},
      },
      editions: {
        contract: { shape: 'list', type: 'string' },
        parse: { template: null },
        enum: { policy: 'open', match: { strategy: 'exact' } },
        priority: {},
      },
    },
    known_values: {
      colors: { policy: 'closed', values: ['black', 'white', 'red', 'blue', 'green', 'pink', 'purple', 'gray', 'yellow', 'orange'] },
    },
  };
  specDb.upsertCompiledRules(JSON.stringify(compiledRules), JSON.stringify({}));
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

describe('CEF candidate gate integration', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    specDb = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
    seedCompiledRules(specDb);
  });

  after(() => {
    specDb.close();
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  // --- 1. All valid → CEF writes + candidates written ---
  it('valid colors → CEF writes + candidates in DB + product.json', async () => {
    const pid = 'mouse-valid';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: { llmModelPlan: 'test-model' },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white'],
        editions: {},
        default_color: 'black',
      }),
    });

    assert.equal(result.rejected, false);
    assert.deepEqual(result.colors, ['black', 'white']);

    // CEF's own tables populated
    const cefRow = specDb.getColorEditionFinder(pid);
    assert.ok(cefRow);
    assert.deepEqual(cefRow.colors, ['black', 'white']);

    // Candidates in DB
    const candidates = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    assert.ok(candidates.length >= 1);

    // Candidates in product.json
    const pj = readProductJson(pid);
    assert.ok(pj.candidates?.colors?.length >= 1);
  });

  // --- 2. Colors fail validation → rejected, no candidate writes ---
  it('invalid colors → entire run rejected, no candidate writes', async () => {
    const pid = 'mouse-bad';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['sparkle-unicorn', 'phantom-blue'], // not in known_values (closed enum)
        editions: {},
        default_color: 'sparkle-unicorn',
      }),
    });

    assert.equal(result.rejected, true);

    // No candidates written
    const candidates = specDb.getAllFieldCandidatesByProduct(pid);
    assert.equal(candidates.length, 0);

    // BUT: rejected run IS persisted (for audit + run numbering)
    const cefRow = specDb.getColorEditionFinder(pid);
    assert.ok(cefRow, 'summary row exists with empty colors');
    assert.deepEqual(cefRow.colors, []);

    const cefJson = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.ok(cefJson, 'JSON file exists with rejected run');
    assert.equal(cefJson.runs[0].status, 'rejected');
  });

  // --- 3. Repaired values flow through ---
  it('repaired values used in CEF tables', async () => {
    const pid = 'mouse-repair';
    ensureProductJson(pid);

    // "Black" (uppercase B) should be normalized to "black"
    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['Black', 'White'],
        editions: {},
        default_color: 'Black',
      }),
    });

    assert.equal(result.rejected, false);
    // Repaired values in return
    assert.ok(result.colors.includes('black'));
    assert.ok(result.colors.includes('white'));

    // CEF tables use repaired values
    const cefRow = specDb.getColorEditionFinder(pid);
    assert.ok(cefRow.colors.includes('black'));
  });

  // --- 4. Failure record stored in runs table ---
  it('failure record exists in SQL and JSON', async () => {
    const pid = 'mouse-failrec';
    ensureProductJson(pid);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: { llmModelPlan: 'test-model' },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['neon-galaxy-burst'],
        editions: {},
        default_color: 'neon-galaxy-burst',
      }),
    });

    // SQL run row
    const runs = specDb.listColorEditionFinderRuns(pid);
    assert.ok(runs.length >= 1);
    const failedRun = runs[runs.length - 1];
    assert.equal(failedRun.response?.status, 'rejected');
    assert.ok(Array.isArray(failedRun.response?.rejections));

    // JSON persistence — rejected run must be in durable SSOT
    const json = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.ok(json, 'JSON file must exist after rejected run');
    assert.equal(json.runs.length, 1, 'rejected run persisted to JSON');
    assert.equal(json.runs[0].status, 'rejected');
    assert.equal(json.next_run_number, 2, 'next_run_number incremented past rejection');
  });

  // --- 5. Summary row unchanged on failure ---
  it('summary row stays at last good state after failure', async () => {
    const pid = 'mouse-summary';
    ensureProductJson(pid);

    // First: successful run
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black'], editions: {}, default_color: 'black' }),
    });

    const summaryBefore = specDb.getColorEditionFinder(pid);
    assert.deepEqual(summaryBefore.colors, ['black']);

    // Second: failed run
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['fake-color-999'], editions: {}, default_color: 'fake' }),
    });

    // Summary colors unchanged (selected from last valid run)
    const summaryAfter = specDb.getColorEditionFinder(pid);
    assert.deepEqual(summaryAfter.colors, ['black']);
    // run_count increases because rejected runs are counted
    assert.equal(summaryAfter.run_count, summaryBefore.run_count + 1);
  });

  // --- 6. Summary row exists but empty after failure ---
  it('summary row has empty colors after failed run', async () => {
    const pid = 'mouse-cd';
    ensureProductJson(pid);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['nonexistent-color'], editions: {}, default_color: '' }),
    });

    // Summary row exists (rejected run is counted)
    const summary = specDb.getColorEditionFinder(pid);
    assert.ok(summary, 'summary row exists after rejected run');
    assert.deepEqual(summary.colors, [], 'no valid colors from rejected run');
  });

  // --- 7. Second run after failure succeeds normally ---
  it('success after failure works normally', async () => {
    const pid = 'mouse-recover';
    ensureProductJson(pid);

    // Failed run
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['bad-color'], editions: {}, default_color: '' }),
    });

    // Successful run
    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['red', 'white'], editions: {}, default_color: 'red' }),
    });

    assert.equal(result.rejected, false);
    assert.deepEqual(result.colors, ['red', 'white']);

    // CEF tables populated
    const cefRow = specDb.getColorEditionFinder(pid);
    assert.ok(cefRow);
    assert.deepEqual(cefRow.colors, ['red', 'white']);

    // Candidates exist
    const candidates = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    assert.ok(candidates.length >= 1);
  });

  // --- 8. Edition candidates (per-variant) carry repaired values ---
  it('editions candidates are per-variant rows with repaired slugs', async () => {
    const pid = 'mouse-ed-recon';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['Black', 'Red'],
        editions: { 'Cyberpunk Edition': { colors: ['Black'] }, 'Halo Edition': { colors: ['Red'] } },
        default_color: 'Black',
      }),
    });

    assert.equal(result.rejected, false);

    // One field_candidates row per edition variant; slugs normalized by validation pipeline.
    const edCandidates = specDb.getFieldCandidatesByProductAndField(pid, 'editions');
    assert.equal(edCandidates.length, 2, 'one row per edition variant');
    const slugs = edCandidates.map(r => JSON.parse(r.value)[0]);
    assert.ok(slugs.includes('cyberpunk-edition'));
    assert.ok(slugs.includes('halo-edition'));
    for (const r of edCandidates) {
      assert.ok(r.variant_id, 'edition row is variant-scoped');
    }

    // product.json mirror also has per-variant entries
    const pj = readProductJson(pid);
    assert.ok(pj.candidates.editions);
    const jsonSlugs = pj.candidates.editions.map(e => (Array.isArray(e.value) ? e.value[0] : JSON.parse(e.value)[0]));
    assert.ok(jsonSlugs.includes('cyberpunk-edition'));
    assert.ok(jsonSlugs.includes('halo-edition'));
  });

  // --- 8b. Edition combo surfaces as a colors candidate — INTACT ---
  // WHY: COMBOS STAY INTACT. Per the LLM adapter contract, editions[slug].colors
  // is a single-element array with the full combo string (e.g. ["black+white"]).
  // That combo MUST appear in the colors candidate as-is, never split into atoms.
  // Splitting is reserved for palette validation / repair only.
  it('writes an edition color combo as a colors candidate — combo stays intact (no atom split)', async () => {
    const pid = 'mouse-ed-combo';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: { 'Launch Edition': { colors: ['black+white'] } },
        default_color: 'black',
      }),
    });

    assert.equal(result.rejected, false);

    // Per-variant: one color row for 'black', one for edition combo 'black+white'
    const colorCandidates = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    const values = colorCandidates.map(r => JSON.parse(r.value)[0]);
    assert.ok(values.includes('black'), 'standalone black present');
    assert.ok(values.includes('black+white'), 'edition combo surfaces as colors candidate intact');
    // The combo must NOT be split into atoms — "white" alone must not leak in
    // unless the LLM explicitly declared it as a standalone color.
    assert.ok(!values.includes('white'), 'combo not split into standalone atom');
  });

  it('does not duplicate a combo already present in standalone colors', async () => {
    const pid = 'mouse-ed-combo-dup';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black+white'],
        editions: { 'Launch Edition': { colors: ['black+white'] } },
        default_color: 'black+white',
      }),
    });

    assert.equal(result.rejected, false);

    // Per-variant: one variant (edition holding the combo) → one row for fieldKey='colors'
    const colorCandidates = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    const values = colorCandidates.map(r => JSON.parse(r.value)[0]);
    const combos = values.filter(v => v === 'black+white');
    assert.equal(combos.length, 1, 'combo present exactly once across per-variant rows');
  });

  it('preserves a single-color edition combo as its atom entry (no spurious splits)', async () => {
    const pid = 'mouse-ed-single';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: { 'Solo Edition': { colors: ['red'] } },
        default_color: 'black',
      }),
    });

    assert.equal(result.rejected, false);

    const colorCandidates = specDb.getFieldCandidatesByProductAndField(pid, 'colors');
    const values = colorCandidates.map(r => JSON.parse(r.value)[0]);
    assert.ok(values.includes('red'), 'single-color edition combo merged as-is');
    assert.ok(!values.some(v => v.includes('+')), 'no spurious + combo for single-color edition');
  });

  // --- 9. Editions record passes shape=record validation ---
  it('editions record with nested colors passes validation', async () => {
    const pid = 'mouse-ed-shape';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white'],
        editions: { 'Launch Edition': { colors: ['black'] } },
        default_color: 'black',
      }),
    });

    assert.equal(result.rejected, false);
    assert.ok(result.editions['Launch Edition']);
    assert.deepEqual(result.editions['Launch Edition'].colors, ['black']);
  });

  // --- 10. Empty editions passes validation ---
  it('empty editions record passes validation', async () => {
    const pid = 'mouse-ed-empty';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: {},
        default_color: 'black',
      }),
    });

    assert.equal(result.rejected, false);
    assert.deepEqual(result.editions, {});
  });

  // --- 11. LLM error → rejected, no persistence ---
  it('LLM error returns rejected with llm_error reason, no DB writes', async () => {
    const pid = 'mouse-llm-err';
    ensureProductJson(pid);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub(REGISTERED_COLORS),
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => { throw new Error('Connection timed out'); },
    });

    assert.equal(result.rejected, true);
    assert.equal(result.rejections[0].reason_code, 'llm_error');
    assert.ok(result.rejections[0].message.includes('Connection timed out'));

    // No CEF summary row (LLM error returns early, no persistence)
    const cefRow = specDb.getColorEditionFinder(pid);
    assert.equal(cefRow, null, 'no summary row on LLM error');

    // No candidates
    const candidates = specDb.getAllFieldCandidatesByProduct(pid);
    assert.equal(candidates.length, 0);
  });
});
