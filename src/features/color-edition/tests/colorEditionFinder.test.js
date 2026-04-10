import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { runColorEditionFinder } from '../colorEditionFinder.js';
import { readColorEdition } from '../colorEditionStore.js';

const TMP_ROOT = path.join(os.tmpdir(), `cef-finder-test-${Date.now()}`);
const DB_DIR = path.join(TMP_ROOT, '_db');
const DB_PATH = path.join(DB_DIR, 'spec.sqlite');
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

function makeAppDbStub(colors = []) {
  const registry = new Map(colors.map(c => [c.name, c]));
  return {
    listColors: () => [...registry.values()],
    _registry: registry,
  };
}

function makeLlmStub(response) {
  let callCount = 0;
  const stub = async () => {
    callCount++;
    if (typeof response === 'function') return response(callCount);
    return response;
  };
  stub.callCount = () => callCount;
  return stub;
}

const PRODUCT = {
  product_id: 'mouse-001',
  category: 'mouse',
  brand: 'Corsair',
  model: 'M75 Air Wireless',
  variant: '',
};

describe('runColorEditionFinder', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    specDb = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
  });

  after(() => {
    specDb.close();
    cleanup(TMP_ROOT);
  });

  it('happy path: returns colors + editions with paired structure', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'white', hex: '#ffffff', css_var: '--color-white' },
    ]);

    const result = await runColorEditionFinder({
      product: PRODUCT,
      appDb,
      specDb,
      config: {},
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white'],
        editions: { 'cyberpunk-2077-edition': { colors: ['black'] } },
        default_color: 'black',
      }),
    });

    assert.deepEqual(result.colors, ['black', 'white']);
    assert.deepEqual(result.editions, { 'cyberpunk-2077-edition': { colors: ['black'] } });
    assert.equal(result.default_color, 'black');
  });

  it('stores run with prompt and response in JSON', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-prompt' },
      appDb,
      specDb,
      config: { llmModelPlan: 'gpt-5.4' },
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: {},
        default_color: 'black',
      }),
    });

    const json = readColorEdition({ productId: 'mouse-prompt', productRoot: PRODUCT_ROOT });
    assert.ok(json.runs);
    assert.equal(json.runs.length, 1);
    assert.ok(json.runs[0].prompt.system.length > 0, 'system prompt captured');
    assert.ok(json.runs[0].prompt.user.length > 0, 'user message captured');
    assert.deepEqual(json.runs[0].response.colors, ['black']);
    assert.equal(json.runs[0].model, 'gpt-5.4');
  });

  it('selected at top level matches latest run output', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-selected' },
      appDb,
      specDb,
      config: {},
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: { 'launch': { colors: ['black'] } },
        default_color: 'black',
      }),
    });

    const json = readColorEdition({ productId: 'mouse-selected', productRoot: PRODUCT_ROOT });
    assert.deepEqual(json.selected.colors, ['black']);
    assert.deepEqual(json.selected.editions, { 'launch': { colors: ['black'] } });
    assert.equal(json.selected.default_color, 'black');
  });

  it('SQL summary updated with new editions format', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-sql' },
      appDb,
      specDb,
      config: {},
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: { 'launch': { colors: ['black'] } },
        default_color: 'black',
      }),
    });

    const row = specDb.getColorEditionFinder('mouse-sql');
    assert.ok(row);
    assert.deepEqual(row.colors, ['black']);
    assert.equal(row.default_color, 'black');
  });

  it('SQL run row inserted with correct data after LLM run', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'white', hex: '#ffffff', css_var: '--color-white' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-sqlrun' },
      appDb,
      specDb,
      config: { llmModelPlan: 'gpt-5.4' },
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white'],
        editions: { 'launch': { colors: ['black'] } },
        default_color: 'black',
      }),
    });

    const runs = specDb.listColorEditionFinderRuns('mouse-sqlrun');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].run_number, 1);
    assert.equal(runs[0].model, 'gpt-5.4');
    assert.equal(runs[0].fallback_used, false);
    assert.deepEqual(runs[0].selected.colors, ['black', 'white']);
    assert.ok(runs[0].prompt.system.length > 0, 'prompt captured in SQL');
    assert.deepEqual(runs[0].response.colors, ['black', 'white']);
  });

  it('second run inserts second SQL run row', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'red', hex: '#ef4444', css_var: '--color-red' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-sqlrun2' },
      appDb, specDb, config: { llmModelPlan: 'model-a' },
      logger: null, productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black'], editions: {}, default_color: 'black' }),
    });
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-sqlrun2' },
      appDb, specDb, config: { llmModelPlan: 'model-b' },
      logger: null, productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black', 'red'], editions: {}, default_color: 'black' }),
    });

    const runs = specDb.listColorEditionFinderRuns('mouse-sqlrun2');
    assert.equal(runs.length, 2);
    assert.equal(runs[0].run_number, 1);
    assert.equal(runs[0].model, 'model-a');
    assert.equal(runs[1].run_number, 2);
    assert.equal(runs[1].model, 'model-b');
    assert.deepEqual(runs[1].selected.colors, ['black', 'red']);
  });

  it('empty colors/editions handled gracefully', async () => {
    const appDb = makeAppDbStub([]);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-empty' },
      appDb,
      specDb,
      config: {},
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [],
        editions: {},
        default_color: '',
      }),
    });

    assert.deepEqual(result.colors, []);
    assert.deepEqual(result.editions, {});
    assert.equal(result.default_color, '');
  });

  it('cooldown set to 30 days from now', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);
    const beforeMs = Date.now();

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-cooldown' },
      appDb,
      specDb,
      config: {},
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: {},
        default_color: 'black',
      }),
    });

    const row = specDb.getColorEditionFinder('mouse-cooldown');
    const cooldownDate = new Date(row.cooldown_until).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expectedMin = beforeMs + thirtyDaysMs - 5000;
    const expectedMax = Date.now() + thirtyDaysMs + 5000;
    assert.ok(cooldownDate >= expectedMin, 'cooldown at least ~30 days out');
    assert.ok(cooldownDate <= expectedMax, 'cooldown not more than ~30 days out');
  });

  it('second run receives previousRuns as known inputs in prompt', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'red', hex: '#ef4444', css_var: '--color-red' },
    ]);

    // First run
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-history' },
      appDb,
      specDb,
      config: { llmModelPlan: 'gpt-5.4' },
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: {},
        default_color: 'black',
      }),
    });

    // Second run — prompt should include known_colors from first run
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-history' },
      appDb,
      specDb,
      config: { llmModelPlan: 'gpt-6' },
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'red'],
        editions: {},
        default_color: 'black',
      }),
    });

    const json = readColorEdition({ productId: 'mouse-history', productRoot: PRODUCT_ROOT });
    assert.equal(json.runs.length, 2);
    // v2: second run's prompt should reference previous findings
    assert.ok(json.runs[1].prompt.system.includes('Previous findings') || json.runs[1].prompt.system.includes('colors found so far'), 'prompt includes previous run context');
    assert.deepEqual(json.selected.colors, ['black', 'red']);
  });

  // ── v2 audit fields: siblings_excluded + discovery_log ──

  it('stores siblings_excluded and discovery_log in run.response', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-audit' },
      appDb,
      specDb,
      config: {},
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: {},
        default_color: 'black',
        siblings_excluded: ['M75 Air Wireless Pro', 'M75 Wired'],
        discovery_log: {
          confirmed_from_known: [],
          added_new: ['black'],
          rejected_from_known: [],
          urls_checked: ['https://corsair.com/m75'],
          queries_run: ['Corsair M75 Air Wireless colors'],
        },
      }),
    });

    const json = readColorEdition({ productId: 'mouse-audit', productRoot: PRODUCT_ROOT });
    const runResp = json.runs[0].response;
    assert.deepEqual(runResp.siblings_excluded, ['M75 Air Wireless Pro', 'M75 Wired']);
    assert.deepEqual(runResp.discovery_log.urls_checked, ['https://corsair.com/m75']);
    assert.deepEqual(runResp.discovery_log.added_new, ['black']);
  });

  it('selected does NOT contain siblings_excluded or discovery_log', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-sel-audit' },
      appDb,
      specDb,
      config: {},
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: {},
        default_color: 'black',
        siblings_excluded: ['M75 Pro'],
        discovery_log: { confirmed_from_known: [], added_new: [], rejected_from_known: [], urls_checked: [], queries_run: [] },
      }),
    });

    const json = readColorEdition({ productId: 'mouse-sel-audit', productRoot: PRODUCT_ROOT });
    assert.equal(json.selected.siblings_excluded, undefined, 'no siblings_excluded in selected');
    assert.equal(json.selected.discovery_log, undefined, 'no discovery_log in selected');
  });

  it('v1 LLM response without audit fields still stores cleanly', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-v1compat' },
      appDb,
      specDb,
      config: {},
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: {},
        default_color: 'black',
        // no siblings_excluded, no discovery_log
      }),
    });

    const json = readColorEdition({ productId: 'mouse-v1compat', productRoot: PRODUCT_ROOT });
    const runResp = json.runs[0].response;
    assert.deepEqual(runResp.siblings_excluded, []);
    assert.deepEqual(runResp.discovery_log, {
      confirmed_from_known: [], added_new: [], rejected_from_known: [],
      urls_checked: [], queries_run: [],
    });
  });

  it('next_run_number persisted in JSON after runs', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-nrn' },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black'], editions: {}, default_color: 'black' }),
    });

    const json = readColorEdition({ productId: 'mouse-nrn', productRoot: PRODUCT_ROOT });
    assert.equal(json.next_run_number, 2);
    assert.equal(json.run_count, 1);
  });
});
