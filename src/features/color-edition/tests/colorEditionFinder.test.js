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
    const raw = typeof response === 'function' ? response(callCount) : response;
    return { result: raw, usage: null };
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
      { name: 'red', hex: '#ef4444', css_var: '--color-red' },
    ]);

    const result = await runColorEditionFinder({
      product: PRODUCT,
      appDb,
      specDb,
      config: {},
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white', 'black+red'],
        editions: { 'cyberpunk-2077-edition': { colors: ['black+red'] } },
        default_color: 'black',
      }),
    });

    assert.deepEqual(result.colors, ['black', 'white']);
    assert.deepEqual(result.editions, { 'cyberpunk-2077-edition': { colors: ['black+red'] } });
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
      { name: 'red', hex: '#ef4444', css_var: '--color-red' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-sql' },
      appDb,
      specDb,
      config: {},
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'black+red'],
        editions: { 'launch': { colors: ['black+red'] } },
        default_color: 'black',
      }),
    });

    const row = specDb.getColorEditionFinder('mouse-sql');
    assert.ok(row);
    assert.deepEqual(row.colors, ['black'], 'standalone color only; edition combo excluded');
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

  it('composite key stripped from stored model in JSON and SQL', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-composite' },
      appDb,
      specDb,
      config: { llmModelPlan: 'lab-openai:gpt-5.4-xhigh' },
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: {},
        default_color: 'black',
      }),
    });

    const json = readColorEdition({ productId: 'mouse-composite', productRoot: PRODUCT_ROOT });
    assert.equal(json.runs[0].model, 'gpt-5.4-xhigh', 'JSON run stores bare model, not composite key');

    const runs = specDb.listColorEditionFinderRuns('mouse-composite');
    assert.equal(runs[0].model, 'gpt-5.4-xhigh', 'SQL run stores bare model, not composite key');
  });

  it('onModelResolved updates stored model and fallback_used when fallback fires', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);

    // WHY: _callLlmOverride bypasses routing, so we simulate the fallback by
    // calling the onModelResolved wrapper that the orchestrator passes as 2nd arg.
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-fallback' },
      appDb,
      specDb,
      config: { llmModelPlan: 'gpt-5.4' },
      logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async (_domainArgs, { onModelResolved: notify } = {}) => {
        // Simulate routing calling onModelResolved with fallback model
        notify?.({ model: 'claude-sonnet', provider: 'anthropic', isFallback: true });
        return { result: { colors: ['black'], editions: {}, default_color: 'black' }, usage: null };
      },
    });

    const json = readColorEdition({ productId: 'mouse-fallback', productRoot: PRODUCT_ROOT });
    assert.equal(json.runs[0].model, 'claude-sonnet', 'stored model should be the fallback model');
    assert.equal(json.runs[0].fallback_used, true, 'fallback_used should be true');

    const runs = specDb.listColorEditionFinderRuns('mouse-fallback');
    assert.equal(runs[0].model, 'claude-sonnet', 'SQL model should be fallback');
    assert.equal(runs[0].fallback_used, true, 'SQL fallback_used should be true');
  });

  it('Gate 1: unknown color atom rejects entire run before identity check', async () => {
    const pid = 'mouse-gate1';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);

    // Run 1: establish registry
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black'], editions: {}, default_color: 'black' }),
    });

    // Run 2: LLM 1 returns hallucinated color — palette has no 'light-olive'
    const identityCheckCalled = { count: 0 };
    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black', 'light-olive+black+red'], editions: {}, default_color: 'black' }),
      _callIdentityCheckOverride: async () => { identityCheckCalled.count++; return { result: { mappings: [], remove: [] } }; },
    });

    assert.equal(result.rejected, true, 'run must be rejected');
    assert.ok(result.rejections.some(r => r.reason_code === 'unknown_color_atom'), 'rejection reason_code');
    assert.equal(identityCheckCalled.count, 0, 'identity check must NOT run when Gate 1 fails');

    // Registry unchanged from Run 1
    const json = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.ok(json.variant_registry.length > 0, 'registry preserved');
    assert.ok(!json.variant_registry.find(e => e.variant_key === 'color:light-olive+black+red'), 'hallucinated color NOT in registry');
  });

  it('LLM 2 (identity check) error rejects entire run', async () => {
    const pid = 'mouse-idcheck-llm-error';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'white', hex: '#ffffff', css_var: '--color-white' },
    ]);

    // Run 1: establish registry
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black', 'white'], editions: {}, default_color: 'black' }),
    });

    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.ok(afterRun1.variant_registry.length > 0, 'Run 1 built registry');

    // Run 2: identity check LLM throws (network error, timeout, parse failure)
    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black', 'white'], editions: {}, default_color: 'black' }),
      _callIdentityCheckOverride: async () => { throw new Error('LLM 2 network timeout'); },
    });

    assert.equal(result.rejected, true, 'run must be rejected when LLM 2 fails');
    assert.ok(result.rejections.some(r => r.reason_code === 'identity_check_error'), 'rejection reason_code');

    // Registry unchanged from Run 1
    const afterRun2 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.deepStrictEqual(afterRun2.variant_registry, afterRun1.variant_registry, 'registry must not change');
  });

  it('Gate 2: duplicate match target rejects entire run', async () => {
    const pid = 'mouse-gate2-dup';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'white', hex: '#ffffff', css_var: '--color-white' },
    ]);

    // Run 1: establish registry
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black', 'white'], editions: {}, default_color: 'black' }),
    });

    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    const blackId = afterRun1.variant_registry.find(e => e.variant_key === 'color:black').variant_id;

    // Run 2: identity check maps TWO discoveries to the same variant_id (the bug)
    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black', 'white'], editions: {}, default_color: 'black' }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: [
          { new_key: 'color:black', match: blackId, action: 'match', reason: 'same' },
          { new_key: 'color:white', match: blackId, action: 'match', reason: 'also same?' },
        ],
        remove: [],
      }),
    });

    assert.equal(result.rejected, true, 'run must be rejected');
    assert.ok(result.rejections.some(r => r.reason_code === 'identity_check_invalid'), 'rejection reason_code');

    // WHY: Gate 2 rejection must not leave a ghost successful run or pollute selected.
    const afterRun2 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(afterRun2.runs.length, 2, 'expect exactly 2 runs (Run 1 + rejected Run 2)');
    assert.equal(afterRun2.runs[0].status, undefined, 'Run 1 is successful (no status)');
    assert.equal(afterRun2.runs[1].status, 'rejected', 'Run 2 is rejected');
    assert.deepStrictEqual(afterRun2.selected.colors, ['black', 'white'], 'selected must reflect Run 1 only');
  });

  it('identity check with match + new correctly updates registry and selected', async () => {
    const pid = 'mouse-match-new';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'deep-ocean-blue', hex: '#003366', css_var: '--color-deep-ocean-blue' },
      { name: 'gold', hex: '#ffd700', css_var: '--color-gold' },
    ]);

    // Run 1: establish registry
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: makeAppDbStub([
        { name: 'black', hex: '#000000', css_var: '--color-black' },
        { name: 'ocean-blue', hex: '#003366', css_var: '--color-ocean-blue' },
      ]),
      specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black', 'ocean-blue'], editions: {}, default_color: 'black' }),
    });

    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    const blackId = afterRun1.variant_registry.find(e => e.variant_key === 'color:black').variant_id;
    const oceanId = afterRun1.variant_registry.find(e => e.variant_key === 'color:ocean-blue').variant_id;

    // Run 2: identity check matches black, updates ocean-blue → deep-ocean-blue, adds gold
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black', 'deep-ocean-blue', 'gold'], editions: {}, default_color: 'black' }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: [
          { new_key: 'color:black', match: blackId, action: 'match', reason: 'same' },
          { new_key: 'color:deep-ocean-blue', match: oceanId, action: 'match', reason: 'better palette match' },
          { new_key: 'color:gold', match: null, action: 'new', reason: 'new color' },
        ],
        remove: [],
      }),
    });

    const json = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });

    // Registry: black unchanged, ocean-blue updated to deep-ocean-blue (same id), gold created
    assert.equal(json.variant_registry.find(e => e.variant_id === blackId)?.variant_key, 'color:black');
    assert.equal(json.variant_registry.find(e => e.variant_id === oceanId)?.variant_key, 'color:deep-ocean-blue');
    assert.ok(json.variant_registry.find(e => e.variant_key === 'color:gold'), 'gold created');
    assert.equal(json.variant_registry.length, 3, '2 existing + 1 new');
  });

  it('emits discovery and identity check as separate labeled LLM calls in correct order', async () => {
    const pid = 'mouse-call-order';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'white', hex: '#ffffff', css_var: '--color-white' },
    ]);

    // Run 1: establish variant registry
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black', 'white'], editions: {}, default_color: 'black' }),
    });

    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.ok(afterRun1.variant_registry.length > 0, 'registry must exist after run 1');

    // Run 2: triggers identity check path — capture all onLlmCallComplete calls
    const llmCalls = [];
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({ colors: ['black', 'white'], editions: {}, default_color: 'black' }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: afterRun1.variant_registry.map(e => ({
          new_key: e.variant_key, match: e.variant_id, action: 'match', reason: 'same',
        })),
        remove: [],
      }),
      onLlmCallComplete: (call) => llmCalls.push(call),
    });

    // Should have 4 emits: discovery pre, discovery post, identity pre, identity post
    assert.equal(llmCalls.length, 4, `expected 4 emits, got ${llmCalls.length}: ${llmCalls.map(c => `${c.label || 'no-label'}(resp:${c.response === null ? 'null' : 'set'})`).join(', ')}`);

    // Discovery pre-emit (response: null)
    assert.equal(llmCalls[0].response, null, 'call 0 should be discovery pre-emit (null response)');
    assert.equal(llmCalls[0].label, 'Discovery', 'call 0 label');

    // Discovery post-emit (response filled)
    assert.notEqual(llmCalls[1].response, null, 'call 1 should be discovery post-emit (non-null response)');
    assert.equal(llmCalls[1].label, 'Discovery', 'call 1 label');

    // Identity Check pre-emit (response: null)
    assert.equal(llmCalls[2].response, null, 'call 2 should be identity pre-emit (null response)');
    assert.equal(llmCalls[2].label, 'Identity Check', 'call 2 label');

    // Identity Check post-emit (response filled)
    assert.notEqual(llmCalls[3].response, null, 'call 3 should be identity post-emit (non-null response)');
    assert.equal(llmCalls[3].label, 'Identity Check', 'call 3 label');
  });

  it('edition slug drift: selected.editions re-keyed to canonical registry slug', async () => {
    const pid = 'mouse-slug-drift';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'red', hex: '#ef4444', css_var: '--color-red' },
      { name: 'light-olive', hex: '#b5b35c', css_var: '--color-light-olive' },
    ]);

    // Run 1: discovery uses slug 'doom-the-dark-ages-edition'
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'light-olive+black+red'],
        editions: { 'doom-the-dark-ages-edition': { display_name: 'DOOM: The Dark Ages', colors: ['light-olive+black+red'] } },
        default_color: 'black',
      }),
    });

    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    const doomEntry = afterRun1.variant_registry.find(e => e.edition_slug === 'doom-the-dark-ages-edition');
    assert.ok(doomEntry, 'DOOM variant must exist in registry after Run 1');
    const blackId = afterRun1.variant_registry.find(e => e.variant_key === 'color:black').variant_id;

    // Run 2: discovery returns DRIFTED slug 'doom-the-dark-ages' (dropped -edition)
    // Identity check correctly matches it to existing variant
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'light-olive+black+red'],
        editions: { 'doom-the-dark-ages': { display_name: 'DOOM: The Dark Ages', colors: ['light-olive+black+red'] } },
        default_color: 'black',
      }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: [
          { new_key: 'color:black', match: blackId, action: 'match', reason: 'same' },
          { new_key: 'edition:doom-the-dark-ages-edition', match: doomEntry.variant_id, action: 'match', reason: 'same DOOM edition' },
        ],
        remove: [],
      }),
    });

    const afterRun2 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });

    // selected.editions must use canonical slug, NOT the drifted one
    assert.ok(afterRun2.selected.editions['doom-the-dark-ages-edition'],
      'selected.editions must use canonical slug doom-the-dark-ages-edition');
    assert.equal(afterRun2.selected.editions['doom-the-dark-ages'], undefined,
      'drifted slug doom-the-dark-ages must NOT appear in selected.editions');

    // Run 2's per-run selected must also use canonical slug
    const run2 = afterRun2.runs[1];
    assert.ok(run2.selected.editions['doom-the-dark-ages-edition'],
      'run 2 selected must use canonical slug');

    // Edition metadata preserved through reconciliation
    assert.equal(afterRun2.selected.editions['doom-the-dark-ages-edition'].display_name, 'DOOM: The Dark Ages');
    assert.deepEqual(afterRun2.selected.editions['doom-the-dark-ages-edition'].colors, ['light-olive+black+red']);

    // SQL summary must use canonical slug
    const sqlRow = specDb.getColorEditionFinder(pid);
    assert.ok(sqlRow.editions.includes('doom-the-dark-ages-edition'), 'SQL editions must use canonical slug');

    // Registry unchanged — still has original edition_slug
    const doomAfter = afterRun2.variant_registry.find(e => e.variant_id === doomEntry.variant_id);
    assert.equal(doomAfter.edition_slug, 'doom-the-dark-ages-edition');
    // Label should be updated from discovery, not fall back to raw slug
    assert.equal(doomAfter.variant_label, 'DOOM: The Dark Ages');
  });

  it('edition slug reconciliation: no-op when slugs already match', async () => {
    const pid = 'mouse-slug-noop';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'red', hex: '#ef4444', css_var: '--color-red' },
    ]);

    // Run 1
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'black+red'],
        editions: { 'cod-bo6-edition': { display_name: 'COD BO6', colors: ['black+red'] } },
        default_color: 'black',
      }),
    });

    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    const codEntry = afterRun1.variant_registry.find(e => e.edition_slug === 'cod-bo6-edition');
    const blackId = afterRun1.variant_registry.find(e => e.variant_key === 'color:black').variant_id;

    // Run 2: slug matches — no drift
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'black+red'],
        editions: { 'cod-bo6-edition': { display_name: 'COD BO6 Edition', colors: ['black+red'] } },
        default_color: 'black',
      }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: [
          { new_key: 'color:black', match: blackId, action: 'match', reason: 'same' },
          { new_key: 'edition:cod-bo6-edition', match: codEntry.variant_id, action: 'match', reason: 'same' },
        ],
        remove: [],
      }),
    });

    const afterRun2 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.ok(afterRun2.selected.editions['cod-bo6-edition'], 'slug unchanged when no drift');
  });


  it('edition slug drift: elimination fallback when registry color_atoms are empty', async () => {
    const pid = 'mouse-slug-elim';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'red', hex: '#ef4444', css_var: '--color-red' },
      { name: 'light-olive', hex: '#b5b35c', css_var: '--color-light-olive' },
    ]);

    // Run 1: seed registry
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'light-olive+black+red'],
        editions: { 'doom-the-dark-ages-edition': { display_name: 'DOOM', colors: ['light-olive+black+red'] } },
        default_color: 'black',
      }),
    });

    // Corrupt the registry to simulate the prior bug — empty color_atoms on DOOM entry
    const json = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    const doomEntry = json.variant_registry.find(e => e.edition_slug === 'doom-the-dark-ages-edition');
    assert.ok(doomEntry);
    doomEntry.color_atoms = []; // simulate corruption from prior slug drift
    const blackId = json.variant_registry.find(e => e.variant_key === 'color:black').variant_id;
    fs.writeFileSync(
      path.join(PRODUCT_ROOT, pid, 'color_edition.json'),
      JSON.stringify(json, null, 2), 'utf8',
    );

    // Run 2: discovery returns drifted slug + identity check matches correctly
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'light-olive+black+red'],
        editions: { 'doom-the-dark-ages': { display_name: 'DOOM: The Dark Ages', colors: ['light-olive+black+red'] } },
        default_color: 'black',
      }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: [
          { new_key: 'color:black', match: blackId, action: 'match', reason: 'same' },
          { new_key: 'edition:doom-the-dark-ages-edition', match: doomEntry.variant_id, action: 'match', reason: 'same DOOM' },
        ],
        remove: [],
      }),
    });

    const afterRun2 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });

    // Elimination fallback should re-key despite empty color_atoms
    assert.ok(afterRun2.selected.editions['doom-the-dark-ages-edition'],
      'elimination fallback must re-key to canonical slug');
    assert.equal(afterRun2.selected.editions['doom-the-dark-ages'], undefined,
      'drifted slug must not appear');
    assert.equal(afterRun2.selected.editions['doom-the-dark-ages-edition'].display_name, 'DOOM: The Dark Ages');

    // Registry color_atoms should be repaired now that applyIdentityMappings can look up the edition
    const doomAfter = afterRun2.variant_registry.find(e => e.variant_id === doomEntry.variant_id);
    assert.deepEqual(doomAfter.color_atoms, ['light-olive', 'black', 'red'],
      'color_atoms should be repaired after reconciliation fixes the lookup');
  });

  // ── Edition combo isolation ──────────────────────────────────────

  it('edition combos excluded from return value and summary colors', async () => {
    const pid = 'mouse-combo-isolate';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'white', hex: '#ffffff', css_var: '--color-white' },
      { name: 'dark-gray', hex: '#333333', css_var: '--color-dark-gray' },
      { name: 'orange', hex: '#ff8800', css_var: '--color-orange' },
    ]);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white', 'dark-gray+black+orange'],
        editions: { 'special-edition': { display_name: 'Special', colors: ['dark-gray+black+orange'] } },
        default_color: 'black',
      }),
    });

    // Return value must only have standalone colors
    assert.ok(result.colors.includes('black'), 'standalone color preserved');
    assert.ok(result.colors.includes('white'), 'standalone color preserved');
    assert.ok(!result.colors.includes('dark-gray+black+orange'), 'edition combo must NOT be in return colors');

    // SQL summary must only have standalone colors
    const sqlRow = specDb.getColorEditionFinder(pid);
    assert.ok(sqlRow.colors.includes('black'));
    assert.ok(sqlRow.colors.includes('white'));
    assert.ok(!sqlRow.colors.includes('dark-gray+black+orange'), 'edition combo must NOT be in summary colors');

    // JSON selected preserves full audit trail (including combo)
    const json = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.ok(json.selected.colors.includes('dark-gray+black+orange'),
      'JSON selected preserves combo for audit trail');
  });

  it('standalone multi-atom color preserved (not mistaken for edition combo)', async () => {
    const pid = 'mouse-multiatom-color';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'red', hex: '#ef4444', css_var: '--color-red' },
    ]);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'black+red'],
        editions: {},
        default_color: 'black',
      }),
    });

    // black+red is a standalone two-tone color, not an edition combo
    assert.ok(result.colors.includes('black+red'), 'multi-atom standalone color must be preserved');
    assert.ok(result.colors.includes('black'));
  });

  // ── Orphan variant reconciliation ─────────────────────────────────
  // WHY: PIF images can reference variant_keys that no longer exist in
  // the registry (slug drift, bug-era rebuilds). LLM 2 reconciles them.

  it('orphan detection: CEF collects orphaned PIF keys and passes to identity check prompt', async () => {
    // Scenario: 5-variant product. PIF has images from a prior run with a
    // stale edition slug. Registry was rebuilt with a different slug.
    const pid = 'mouse-orphan-detect';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'white', hex: '#ffffff', css_var: '--color-white' },
      { name: 'red', hex: '#ef4444', css_var: '--color-red' },
      { name: 'light-olive', hex: '#b5b35c', css_var: '--color-light-olive' },
    ]);

    // Run 1: establish registry with canonical slug
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white', 'light-olive+black+red'],
        editions: { 'doom-the-dark-ages': { display_name: 'DOOM: The Dark Ages', colors: ['light-olive+black+red'] } },
        default_color: 'black',
      }),
    });

    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(afterRun1.variant_registry.length, 3, '3 variants: black, white, doom');

    // Seed PIF images with the canonical keys PLUS a stale edition slug from a prior bug-era PIF run
    const pifDir = path.join(PRODUCT_ROOT, pid);
    fs.writeFileSync(path.join(pifDir, 'product_images.json'), JSON.stringify({
      product_id: pid, category: 'mouse',
      selected: { images: [
        { view: 'top', filename: 'top-black.png', variant_key: 'color:black', variant_id: 'v_stale1' },
        { view: 'top', filename: 'top-doom-old.png', variant_key: 'edition:doom-the-dark-ages-edition', variant_id: 'v_stale_doom' },
      ] },
      carousel_slots: {}, evaluations: [], runs: [],
    }, null, 2), 'utf8');

    // Run 2: identity check prompt should now include the orphaned key
    const llmCalls = [];
    const blackId = afterRun1.variant_registry.find(e => e.variant_key === 'color:black').variant_id;
    const whiteId = afterRun1.variant_registry.find(e => e.variant_key === 'color:white').variant_id;
    const doomId = afterRun1.variant_registry.find(e => e.variant_key === 'edition:doom-the-dark-ages').variant_id;

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white', 'light-olive+black+red'],
        editions: { 'doom-the-dark-ages': { display_name: 'DOOM: The Dark Ages', colors: ['light-olive+black+red'] } },
        default_color: 'black',
      }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: [
          { new_key: 'color:black', match: blackId, action: 'match', reason: 'same' },
          { new_key: 'color:white', match: whiteId, action: 'match', reason: 'same' },
          { new_key: 'edition:doom-the-dark-ages', match: doomId, action: 'match', reason: 'same' },
        ],
        remove: [],
        orphan_remaps: [
          { orphan_key: 'edition:doom-the-dark-ages-edition', action: 'remap', remap_to: 'edition:doom-the-dark-ages', reason: 'slug drift — same DOOM edition, old slug had -edition suffix' },
        ],
      }),
      onLlmCallComplete: (call) => llmCalls.push(call),
    });

    // Identity check prompt must contain the orphaned key
    const identityPrompts = llmCalls.filter(c => c.label === 'Identity Check');
    assert.ok(identityPrompts.length >= 1, 'identity check must fire');
    assert.ok(identityPrompts[0].prompt.system.includes('edition:doom-the-dark-ages-edition'),
      'identity check prompt must include orphaned PIF key');
    assert.ok(identityPrompts[0].prompt.system.includes('ORPHANED PIF IMAGE KEYS'),
      'identity check prompt must include orphan section header');
  });

  it('orphan remap: LLM 2 heals slug-drifted PIF images to canonical registry key', async () => {
    // Scenario: PIF has 8 images tagged edition:doom-the-dark-ages-edition.
    // Registry has edition:doom-the-dark-ages. LLM 2 says "remap".
    // After CEF run, all PIF images should point to the canonical key + correct variant_id.
    const pid = 'mouse-orphan-remap';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'white', hex: '#ffffff', css_var: '--color-white' },
      { name: 'light-olive', hex: '#b5b35c', css_var: '--color-light-olive' },
      { name: 'red', hex: '#ef4444', css_var: '--color-red' },
    ]);

    // Run 1: establish registry
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white', 'light-olive+black+red'],
        editions: { 'doom-the-dark-ages': { display_name: 'DOOM: The Dark Ages', colors: ['light-olive+black+red'] } },
        default_color: 'black',
      }),
    });

    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    const blackId = afterRun1.variant_registry.find(e => e.variant_key === 'color:black').variant_id;
    const whiteId = afterRun1.variant_registry.find(e => e.variant_key === 'color:white').variant_id;
    const doomEntry = afterRun1.variant_registry.find(e => e.variant_key === 'edition:doom-the-dark-ages');

    // Seed PIF with orphaned images (old slug from bug era)
    const pifDir = path.join(PRODUCT_ROOT, pid);
    fs.writeFileSync(path.join(pifDir, 'product_images.json'), JSON.stringify({
      product_id: pid, category: 'mouse',
      selected: { images: [
        { view: 'top', filename: 'top-black.png', variant_key: 'color:black', variant_id: blackId },
        { view: 'top', filename: 'doom-top.png', variant_key: 'edition:doom-the-dark-ages-edition', variant_id: 'v_bugera_doom', variant_label: 'DOOM Old' },
        { view: 'left', filename: 'doom-left.png', variant_key: 'edition:doom-the-dark-ages-edition', variant_id: 'v_bugera_doom', variant_label: 'DOOM Old' },
        { view: 'right', filename: 'doom-right.png', variant_key: 'edition:doom-the-dark-ages-edition', variant_id: 'v_bugera_doom', variant_label: 'DOOM Old' },
      ] },
      carousel_slots: {
        'color:black': { top: 'top-black.png' },
        'edition:doom-the-dark-ages-edition': { top: 'doom-top.png', left: 'doom-left.png' },
      },
      evaluations: [
        { type: 'view', view: 'top', variant_key: 'edition:doom-the-dark-ages-edition', variant_label: 'DOOM Old', model: 'test', ran_at: '2026-04-01T00:00:00Z' },
      ],
      runs: [], run_count: 0,
    }, null, 2), 'utf8');

    // Run 2: identity check remaps the orphaned key
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white', 'light-olive+black+red'],
        editions: { 'doom-the-dark-ages': { display_name: 'DOOM: The Dark Ages', colors: ['light-olive+black+red'] } },
        default_color: 'black',
      }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: [
          { new_key: 'color:black', match: blackId, action: 'match', reason: 'same' },
          { new_key: 'color:white', match: whiteId, action: 'match', reason: 'same' },
          { new_key: 'edition:doom-the-dark-ages', match: doomEntry.variant_id, action: 'match', reason: 'same' },
        ],
        remove: [],
        orphan_remaps: [
          { orphan_key: 'edition:doom-the-dark-ages-edition', action: 'remap', remap_to: 'edition:doom-the-dark-ages', reason: 'slug drift — same DOOM edition' },
        ],
      }),
    });

    // Verify PIF images were remapped
    const pifDoc = JSON.parse(fs.readFileSync(path.join(pifDir, 'product_images.json'), 'utf8'));

    // All 3 DOOM images should now have the canonical key + correct variant_id
    const doomImages = pifDoc.selected.images.filter(i => i.variant_key === 'edition:doom-the-dark-ages');
    assert.equal(doomImages.length, 3, 'all 3 DOOM images remapped to canonical key');
    assert.equal(doomImages[0].variant_id, doomEntry.variant_id, 'variant_id updated to registry value');
    assert.equal(doomImages[0].variant_label, 'DOOM: The Dark Ages', 'label updated');

    // Old key should be gone
    const oldImages = pifDoc.selected.images.filter(i => i.variant_key === 'edition:doom-the-dark-ages-edition');
    assert.equal(oldImages.length, 0, 'no images with orphaned key remain');

    // Carousel slots should be re-keyed
    assert.equal(pifDoc.carousel_slots['edition:doom-the-dark-ages-edition'], undefined, 'old carousel slot removed');
    assert.ok(pifDoc.carousel_slots['edition:doom-the-dark-ages'], 'new carousel slot created');

    // Evaluations should be updated
    const remappedEvals = pifDoc.evaluations.filter(e => e.variant_key === 'edition:doom-the-dark-ages');
    assert.equal(remappedEvals.length, 1, 'eval remapped');

    // Black images untouched
    const blackImages = pifDoc.selected.images.filter(i => i.variant_key === 'color:black');
    assert.equal(blackImages.length, 1, 'non-orphaned images untouched');
  });

  it('orphan dead purge: cross-model contamination — X2A color images snuck into X2H', async () => {
    // Scenario: LLM confused Pulsar X2H with X2A CrazyLight during a bug-era
    // run. PIF fetched "Sunset Haze" images from the X2A product page and
    // stamped them on X2H. X2H was never sold in Sunset Haze — that color
    // only exists on X2A CrazyLight. LLM 2 confirms it's wrong-product data.
    // "dead" = data from wrong product, never real for THIS product.
    const pid = 'mouse-orphan-dead';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'white', hex: '#ffffff', css_var: '--color-white' },
    ]);

    // Run 1: establish X2H registry with its real colors
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid, brand: 'Pulsar', model: 'X2H' },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white'],
        editions: {},
        default_color: 'black',
      }),
    });

    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    const blackId = afterRun1.variant_registry.find(e => e.variant_key === 'color:black').variant_id;
    const whiteId = afterRun1.variant_registry.find(e => e.variant_key === 'color:white').variant_id;

    // Seed PIF with contaminated images — "Sunset Haze" belongs to X2A
    // CrazyLight, not X2H. LLM confused the two during a prior run.
    const pifDir = path.join(PRODUCT_ROOT, pid);
    fs.writeFileSync(path.join(pifDir, 'product_images.json'), JSON.stringify({
      product_id: pid, category: 'mouse',
      selected: { images: [
        { view: 'top', filename: 'top-black.png', variant_key: 'color:black', variant_id: blackId },
        { view: 'top', filename: 'top-white.png', variant_key: 'color:white', variant_id: whiteId },
        { view: 'top', filename: 'sunset-top.png', variant_key: 'color:pink', variant_id: 'v_wrong_product', variant_label: 'Sunset Haze' },
        { view: 'left', filename: 'sunset-left.png', variant_key: 'color:pink', variant_id: 'v_wrong_product', variant_label: 'Sunset Haze' },
      ] },
      carousel_slots: {
        'color:black': { top: 'top-black.png' },
        'color:white': { top: 'top-white.png' },
        'color:pink': { top: 'sunset-top.png', left: 'sunset-left.png' },
      },
      evaluations: [
        { type: 'view', view: 'top', variant_key: 'color:pink', variant_label: 'Sunset Haze', model: 'test', ran_at: '2026-04-01T00:00:00Z' },
        { type: 'view', view: 'top', variant_key: 'color:black', variant_label: 'Black', model: 'test', ran_at: '2026-04-01T00:00:00Z' },
      ],
      runs: [{
        run_number: 1, ran_at: '2026-03-01T00:00:00Z', model: 'test',
        selected: { images: [
          { view: 'top', filename: 'sunset-top.png', variant_key: 'color:pink', variant_id: 'v_wrong_product' },
        ] },
        response: {
          variant_key: 'color:pink', variant_id: 'v_wrong_product',
          images: [{ view: 'top', filename: 'sunset-top.png', variant_key: 'color:pink', variant_id: 'v_wrong_product' }],
        },
      }],
      run_count: 1, next_run_number: 2,
    }, null, 2), 'utf8');

    // Run 2: LLM 2 recognizes Sunset Haze belongs to X2A, not X2H
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid, brand: 'Pulsar', model: 'X2H' },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white'],
        editions: {},
        default_color: 'black',
      }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: [
          { new_key: 'color:black', match: blackId, action: 'match', reason: 'same' },
          { new_key: 'color:white', match: whiteId, action: 'match', reason: 'same' },
        ],
        remove: [],
        orphan_remaps: [
          { orphan_key: 'color:pink', action: 'dead', remap_to: null, reason: 'wrong product — Sunset Haze is an X2A CrazyLight color, X2H was never sold in pink' },
        ],
      }),
    });

    // Verify contaminated images purged, real images preserved
    const pifDoc = JSON.parse(fs.readFileSync(path.join(pifDir, 'product_images.json'), 'utf8'));

    const contaminatedImages = pifDoc.selected.images.filter(i => i.variant_key === 'color:pink');
    assert.equal(contaminatedImages.length, 0, 'wrong-product images purged');

    assert.equal(pifDoc.selected.images.filter(i => i.variant_key === 'color:black').length, 1, 'real black preserved');
    assert.equal(pifDoc.selected.images.filter(i => i.variant_key === 'color:white').length, 1, 'real white preserved');

    assert.equal(pifDoc.carousel_slots['color:pink'], undefined, 'contaminated carousel slot purged');
    assert.ok(pifDoc.carousel_slots['color:black'], 'real slots preserved');

    assert.equal(pifDoc.evaluations.filter(e => e.variant_key === 'color:pink').length, 0, 'contaminated evals purged');
    assert.equal(pifDoc.evaluations.filter(e => e.variant_key === 'color:black').length, 1, 'real evals preserved');

    assert.equal(pifDoc.runs.filter(r => r.response?.variant_key === 'color:pink').length, 0, 'contaminated PIF runs purged');
  });

  it('orphan protection: discontinued Founders Edition is NEVER deleted — historical data preserved', async () => {
    // Scenario: Pulsar X2H had a Founders Edition (green, limited run).
    // It's discontinued — no longer on the manufacturer site. But it WAS
    // a real product. PIF has real images of a real green mouse.
    // LLM 2 correctly omits it from orphan_remaps (not dead, not remappable).
    // The orphaned images MUST survive — they're historical product data.
    const pid = 'mouse-orphan-protect';
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'white', hex: '#ffffff', css_var: '--color-white' },
    ]);

    // Run 1: establish registry (no Founders Edition — it was before our time)
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid, brand: 'Pulsar', model: 'X2H' },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white'],
        editions: {},
        default_color: 'black',
      }),
    });

    const afterRun1 = readColorEdition({ productId: pid, productRoot: PRODUCT_ROOT });
    const blackId = afterRun1.variant_registry.find(e => e.variant_key === 'color:black').variant_id;
    const whiteId = afterRun1.variant_registry.find(e => e.variant_key === 'color:white').variant_id;

    // Seed PIF with Founders Edition images from a prior run.
    // These are REAL images of a REAL product — green X2H Founders Edition.
    const pifDir = path.join(PRODUCT_ROOT, pid);
    fs.writeFileSync(path.join(pifDir, 'product_images.json'), JSON.stringify({
      product_id: pid, category: 'mouse',
      selected: { images: [
        { view: 'top', filename: 'top-black.png', variant_key: 'color:black', variant_id: blackId },
        { view: 'top', filename: 'top-white.png', variant_key: 'color:white', variant_id: whiteId },
        { view: 'top', filename: 'founders-top.png', variant_key: 'edition:founders', variant_id: 'v_old_founders', variant_label: 'Founders Edition' },
        { view: 'left', filename: 'founders-left.png', variant_key: 'edition:founders', variant_id: 'v_old_founders', variant_label: 'Founders Edition' },
      ] },
      carousel_slots: {
        'color:black': { top: 'top-black.png' },
        'color:white': { top: 'top-white.png' },
        'edition:founders': { top: 'founders-top.png', left: 'founders-left.png' },
      },
      evaluations: [
        { type: 'view', view: 'top', variant_key: 'edition:founders', variant_label: 'Founders Edition', model: 'test', ran_at: '2026-04-01T00:00:00Z' },
      ],
      runs: [], run_count: 0,
    }, null, 2), 'utf8');

    // Run 2: LLM 2 correctly follows the prompt — Founders Edition is a real
    // discontinued product, NOT dead. It omits it from orphan_remaps entirely.
    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: pid, brand: 'Pulsar', model: 'X2H' },
      appDb, specDb, config: {}, logger: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white'],
        editions: {},
        default_color: 'black',
      }),
      _callIdentityCheckOverride: makeLlmStub({
        mappings: [
          { new_key: 'color:black', match: blackId, action: 'match', reason: 'same' },
          { new_key: 'color:white', match: whiteId, action: 'match', reason: 'same' },
        ],
        remove: [],
        orphan_remaps: [],  // Founders Edition intentionally omitted — real but no registry match
      }),
    });

    // Founders Edition images MUST still exist — they are historical product data
    const pifDoc = JSON.parse(fs.readFileSync(path.join(pifDir, 'product_images.json'), 'utf8'));

    const foundersImages = pifDoc.selected.images.filter(i => i.variant_key === 'edition:founders');
    assert.equal(foundersImages.length, 2, 'Founders Edition images preserved — real historical data');
    assert.equal(foundersImages[0].variant_label, 'Founders Edition', 'label untouched');

    assert.ok(pifDoc.carousel_slots['edition:founders'], 'Founders carousel slot preserved');

    const foundersEvals = pifDoc.evaluations.filter(e => e.variant_key === 'edition:founders');
    assert.equal(foundersEvals.length, 1, 'Founders eval preserved');

    // Regular images also preserved
    assert.equal(pifDoc.selected.images.filter(i => i.variant_key === 'color:black').length, 1);
    assert.equal(pifDoc.selected.images.filter(i => i.variant_key === 'color:white').length, 1);
  });
});
