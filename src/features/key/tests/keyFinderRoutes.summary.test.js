/**
 * keyFinder route — GET /key-finder/:category/:productId/summary characterization.
 *
 * Per-key rollup for the dashboard. Reads .workspace/products/:pid/key_finder.json
 * via readKeyFinder (no SQL), groups runs by response.primary_field_key, keeps the
 * newest per field_key, derives last_status.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { registerKeyFinderRoutes } from '../api/keyFinderRoutes.js';
import { mergeKeyFinderDiscovery } from '../keyStore.js';
import { initOperationsRegistry } from '../../../core/operations/index.js';

function makeCtx({ specDb, productRoot, configOverrides = {} } = {}) {
  const responses = [];
  const broadcastWs = () => {};
  const ctx = {
    jsonRes: (res, status, body) => { responses.push({ status, body }); return body; },
    readJsonBody: async () => ({}),
    config: { publishConfidenceThreshold: 70, productRoot, ...configOverrides },
    appDb: null,
    getSpecDb: () => specDb,
    broadcastWs,
    logger: { error: () => {}, info: () => {}, warn: () => {} },
  };
  initOperationsRegistry({ broadcastWs });
  return { ctx, responses };
}

const COMPILED_RULES_MOUSE = {
  fields: {
    polling_rate: {
      field_key: 'polling_rate',
      difficulty: 'medium',
      availability: 'always',
      required_level: 'mandatory',
      group: 'sensor_performance',
      ui: { label: 'Polling Rate', group: 'sensor_performance' },
    },
    sensor_model: {
      field_key: 'sensor_model',
      difficulty: 'very_hard',
      availability: 'rare',
      required_level: 'mandatory',
      group: 'sensor_performance',
      ui: { label: 'Sensor Model', group: 'sensor_performance' },
    },
    acceleration: {
      field_key: 'acceleration',
      difficulty: 'easy',
      availability: 'sometimes',
      required_level: 'non_mandatory',
      group: 'sensor_performance',
      ui: { label: 'Acceleration', group: 'sensor_performance' },
    },
    wireless_technology: {
      field_key: 'wireless_technology',
      difficulty: 'easy',
      availability: 'always',
      required_level: 'mandatory',
      group: 'connectivity',
      ui: { label: 'Wireless Technology', group: 'connectivity' },
    },
  },
};

function makeSpecDbStub({ candidateCountByKey = {}, publishedKeys = new Set(), compiledRules = COMPILED_RULES_MOUSE, finderSettings = {} } = {}) {
  const finderStore = {
    getSetting: (k) => (k in finderSettings ? String(finderSettings[k]) : ''),
  };
  return {
    category: 'mouse',
    getFieldCandidatesByProductAndField: (_pid, fk) => {
      const n = candidateCountByKey[fk] ?? 0;
      return Array.from({ length: n }, (_, i) => ({ id: `${fk}-${i}` }));
    },
    getResolvedFieldCandidate: (_pid, fk) => (publishedKeys.has(fk) ? { field_key: fk, value: 'published', confidence: 99 } : null),
    getProduct: () => null,
    getCompiledRules: () => compiledRules,
    getFinderStore: (id) => (id === 'keyFinder' ? finderStore : null),
  };
}

function seedRun({ productRoot, productId, category, fieldKey, runBody }) {
  return mergeKeyFinderDiscovery({
    productId,
    productRoot,
    newDiscovery: { category, last_ran_at: runBody.started_at || '2024-03-15T00:00:00Z' },
    run: runBody,
  });
}

const TMP_ROOT = path.join(os.tmpdir(), `kf-summary-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

function cleanupTmp() {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* */ }
}

describe('GET /key-finder/:category/:productId/summary', () => {
  it('returns all compiled-rule keys (run fields null) when no runs exist', async (t) => {
    t.after(cleanupTmp);
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'empty-prod'), { recursive: true });
    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    const handled = await handler(
      ['key-finder', 'mouse', 'empty-prod', 'summary'],
      null,
      'GET',
      {},
      {},
    );

    assert.notEqual(handled, false);
    assert.equal(responses[0].status, 200);
    const body = responses[0].body;
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 4, 'one row per compiled rule field');
    const fieldKeys = body.map((r) => r.field_key).sort();
    assert.deepEqual(fieldKeys, ['acceleration', 'polling_rate', 'sensor_model', 'wireless_technology']);
    for (const row of body) {
      assert.equal(row.last_run_number, null, 'no runs → null');
      assert.equal(row.run_count, 0);
      assert.equal(row.last_status, null);
    }
  });

  it('returns empty array when compiled rules are missing AND no runs', async (t) => {
    t.after(cleanupTmp);
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'no-rules-prod'), { recursive: true });
    const specDb = makeSpecDbStub({ compiledRules: null });
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'no-rules-prod', 'summary'], null, 'GET', {}, {});

    assert.equal(responses[0].status, 200);
    assert.deepEqual(responses[0].body, []);
  });

  it('returns per-key axes (difficulty / availability / required_level / group) from compiled rules', async (t) => {
    t.after(cleanupTmp);
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'axes-prod'), { recursive: true });
    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'axes-prod', 'summary'], null, 'GET', {}, {});

    const byKey = Object.fromEntries(responses[0].body.map((r) => [r.field_key, r]));
    assert.equal(byKey.sensor_model.difficulty, 'very_hard');
    assert.equal(byKey.sensor_model.availability, 'rare');
    assert.equal(byKey.sensor_model.required_level, 'mandatory');
    assert.equal(byKey.sensor_model.group, 'sensor_performance');
    assert.equal(byKey.wireless_technology.difficulty, 'easy');
    assert.equal(byKey.wireless_technology.group, 'connectivity');
  });

  it('computes per-key budget via calcKeyBudget using finder settings + variantCount', async (t) => {
    t.after(cleanupTmp);
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'budget-prod'), { recursive: true });

    // sensor_model = very_hard(4) + rare(3) + mandatory(2) = 9 pts, 1 variant → 9 attempts (vs floor=3)
    // wireless_technology = easy(1) + always(1) + mandatory(2) = 4 pts, 1 variant → 4 (vs floor=3)
    // acceleration = easy(1) + sometimes(2) + non_mandatory(1) = 4 → 4 (vs floor=3)
    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'budget-prod', 'summary'], null, 'GET', {}, {});

    const byKey = Object.fromEntries(responses[0].body.map((r) => [r.field_key, r]));
    assert.equal(byKey.sensor_model.budget, 9);          // very_hard(4)+rare(3)+mandatory(2)=9
    assert.equal(byKey.wireless_technology.budget, 4);   // easy(1)+always(1)+mandatory(2)=4
    assert.equal(byKey.acceleration.budget, 4);          // easy(1)+sometimes(2)+non_mandatory(1)=4
    assert.equal(byKey.polling_rate.budget, 5);          // medium(2)+always(1)+mandatory(2)=5
  });

  it('surfaces raw_budget alongside integer budget; integer case: raw_budget === budget', async (t) => {
    t.after(cleanupTmp);
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'raw-budget-prod'), { recursive: true });
    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'raw-budget-prod', 'summary'], null, 'GET', {}, {});

    const byKey = Object.fromEntries(responses[0].body.map((r) => [r.field_key, r]));
    // With default perExtra and variantCount=1 (no variants), variant=0 so raw_budget is integer.
    for (const row of Object.values(byKey)) {
      assert.ok('raw_budget' in row, `row ${row.field_key} must expose raw_budget`);
      assert.equal(row.raw_budget, row.budget, `integer case: raw_budget should equal budget for ${row.field_key}`);
    }
  });

  it('surfaces in_flight_as_primary + in_flight_as_passenger_count from the registry', async (t) => {
    t.after(cleanupTmp);
    t.after(async () => {
      const reg = await import('../../../core/operations/keyFinderRegistry.js');
      reg._resetForTest();
    });
    const { register: registryRegister, _resetForTest: registryReset } = await import('../../../core/operations/keyFinderRegistry.js');
    registryReset();
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'in-flight-prod'), { recursive: true });
    // Seed registry: polling_rate is a primary; acceleration is a passenger 2x.
    registryRegister('in-flight-prod', 'polling_rate', 'primary');
    registryRegister('in-flight-prod', 'acceleration', 'passenger');
    registryRegister('in-flight-prod', 'acceleration', 'passenger');

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'in-flight-prod', 'summary'], null, 'GET', {}, {});

    const byKey = Object.fromEntries(responses[0].body.map((r) => [r.field_key, r]));
    assert.equal(byKey.polling_rate.in_flight_as_primary, true);
    assert.equal(byKey.polling_rate.in_flight_as_passenger_count, 0);
    assert.equal(byKey.acceleration.in_flight_as_primary, false);
    assert.equal(byKey.acceleration.in_flight_as_passenger_count, 2);
    // Other rows: not in flight
    assert.equal(byKey.sensor_model.in_flight_as_primary, false);
    assert.equal(byKey.sensor_model.in_flight_as_passenger_count, 0);
  });

  it('rolls up one row per field_key — newest run wins, keeps run_count', async (t) => {
    t.after(cleanupTmp);
    const pid = 'rollup-prod';
    fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });

    seedRun({
      productRoot: PRODUCT_ROOT, productId: pid, category: 'mouse', fieldKey: 'polling_rate',
      runBody: {
        started_at: '2024-03-15T10:00:00Z', duration_ms: 1000, model: 'gpt-5.4-mini',
        fallback_used: false, thinking: true, web_search: true, effort_level: 'xhigh', access_mode: 'api',
        selected: { keys: { polling_rate: { value: 1000, confidence: 82 } } },
        prompt: { system: 's', user: 'u' },
        response: {
          primary_field_key: 'polling_rate',
          results: { polling_rate: { value: 1000, confidence: 82, unknown_reason: '', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } } },
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
      },
    });

    seedRun({
      productRoot: PRODUCT_ROOT, productId: pid, category: 'mouse', fieldKey: 'polling_rate',
      runBody: {
        started_at: '2024-03-15T11:00:00Z', duration_ms: 1100, model: 'gpt-5.4-mini',
        fallback_used: false, thinking: true, web_search: true, effort_level: 'xhigh', access_mode: 'api',
        selected: { keys: { polling_rate: { value: 8000, confidence: 92 } } },
        prompt: { system: 's', user: 'u' },
        response: {
          primary_field_key: 'polling_rate',
          results: { polling_rate: { value: 8000, confidence: 92, unknown_reason: '', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } } },
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
      },
    });

    seedRun({
      productRoot: PRODUCT_ROOT, productId: pid, category: 'mouse', fieldKey: 'sensor_model',
      runBody: {
        started_at: '2024-03-15T12:00:00Z', duration_ms: 1200, model: 'gpt-5.4',
        fallback_used: false, thinking: true, web_search: true, effort_level: 'xhigh', access_mode: 'api',
        selected: { keys: { sensor_model: { value: 'unk', confidence: 0, unknown_reason: 'not disclosed' } } },
        prompt: { system: 's', user: 'u' },
        response: {
          primary_field_key: 'sensor_model',
          results: { sensor_model: { value: 'unk', confidence: 0, unknown_reason: 'not disclosed', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } } },
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
      },
    });

    const specDb = makeSpecDbStub({ candidateCountByKey: { polling_rate: 2, sensor_model: 0 } });
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    const handled = await handler(['key-finder', 'mouse', pid, 'summary'], null, 'GET', {}, {});

    assert.notEqual(handled, false);
    assert.equal(responses[0].status, 200);
    const body = responses[0].body;
    assert.ok(Array.isArray(body));
    // 4 compiled rules → 4 rows (acceleration + wireless_technology have no runs)
    assert.equal(body.length, 4);

    const byKey = Object.fromEntries(body.map((r) => [r.field_key, r]));
    assert.equal(byKey.polling_rate.run_count, 2);
    assert.equal(byKey.polling_rate.last_value, 8000, 'newest run value');
    assert.equal(byKey.polling_rate.last_confidence, 92);
    assert.equal(byKey.polling_rate.candidate_count, 2);
    assert.equal(byKey.sensor_model.run_count, 1);
    assert.equal(byKey.sensor_model.last_value, 'unk');
    assert.equal(byKey.acceleration.run_count, 0);
    assert.equal(byKey.acceleration.last_run_number, null);

    // WHY: Last Model column needs the same LAB/API + FB + thinking/webSearch
    // badges the worker panel shows, not just the bare model string. These
    // fields feed FinderRunModelBadge so the table cell and Run History
    // render identically. Acceleration has no run → all null (not undefined).
    assert.equal(byKey.polling_rate.last_fallback_used, false);
    assert.equal(byKey.polling_rate.last_access_mode, 'api');
    assert.equal(byKey.polling_rate.last_effort_level, 'xhigh');
    assert.equal(byKey.polling_rate.last_thinking, true);
    assert.equal(byKey.polling_rate.last_web_search, true);
    assert.equal(byKey.acceleration.last_fallback_used, null);
    assert.equal(byKey.acceleration.last_access_mode, null);
    assert.equal(byKey.acceleration.last_effort_level, null);
    assert.equal(byKey.acceleration.last_thinking, null);
    assert.equal(byKey.acceleration.last_web_search, null);
  });

  it('derives last_status — resolved / below_threshold / unk / unresolved', async (t) => {
    t.after(cleanupTmp);
    const pid = 'status-prod';
    fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });

    // resolved: selected.keys includes fk
    seedRun({
      productRoot: PRODUCT_ROOT, productId: pid, category: 'mouse', fieldKey: 'polling_rate',
      runBody: {
        started_at: '2024-03-15T10:00:00Z', duration_ms: 1000, model: 'gpt-5.4-mini',
        fallback_used: false, thinking: true, web_search: true, effort_level: 'xhigh', access_mode: 'api',
        selected: { keys: { polling_rate: { value: 8000, confidence: 92 } } },
        prompt: { system: 's', user: 'u' },
        response: {
          primary_field_key: 'polling_rate',
          results: { polling_rate: { value: 8000, confidence: 92, unknown_reason: '', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } } },
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
      },
    });

    // unk: unknown_reason non-empty, no publish
    seedRun({
      productRoot: PRODUCT_ROOT, productId: pid, category: 'mouse', fieldKey: 'sensor_model',
      runBody: {
        started_at: '2024-03-15T11:00:00Z', duration_ms: 1100, model: 'gpt-5.4',
        fallback_used: false, thinking: true, web_search: true, effort_level: 'xhigh', access_mode: 'api',
        selected: { keys: {} },
        prompt: { system: 's', user: 'u' },
        response: {
          primary_field_key: 'sensor_model',
          results: { sensor_model: { value: 'unk', confidence: 0, unknown_reason: 'not disclosed', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } } },
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
      },
    });

    // below_threshold: confidence below threshold, no publish, no unknown_reason
    seedRun({
      productRoot: PRODUCT_ROOT, productId: pid, category: 'mouse', fieldKey: 'acceleration',
      runBody: {
        started_at: '2024-03-15T12:00:00Z', duration_ms: 1200, model: 'gpt-5.4-mini',
        fallback_used: false, thinking: false, web_search: true, effort_level: 'high', access_mode: 'api',
        selected: { keys: {} },
        prompt: { system: 's', user: 'u' },
        response: {
          primary_field_key: 'acceleration',
          results: { acceleration: { value: 50, confidence: 45, unknown_reason: '', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } } },
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
      },
    });

    // polling_rate is published; others are not
    const specDb = makeSpecDbStub({ publishedKeys: new Set(['polling_rate']) });
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', pid, 'summary'], null, 'GET', {}, {});
    const byKey = Object.fromEntries(responses[0].body.map((r) => [r.field_key, r]));

    assert.equal(byKey.polling_rate.last_status, 'resolved');
    assert.equal(byKey.polling_rate.published, true);
    assert.equal(byKey.sensor_model.last_status, 'unk');
    assert.equal(byKey.sensor_model.published, false);
    assert.equal(byKey.acceleration.last_status, 'below_threshold');
    assert.equal(byKey.acceleration.published, false);
  });

  it('bundle_preview is [] for every row when bundlingEnabled is off (default)', async (t) => {
    t.after(cleanupTmp);
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'bp-off-prod'), { recursive: true });
    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'bp-off-prod', 'summary'], null, 'GET', {}, {});
    for (const row of responses[0].body) {
      assert.deepEqual(row.bundle_preview, [], `${row.field_key} bundle_preview empty when bundling off`);
    }
  });

  it('bundle_preview populated when bundlingEnabled ON + same-group peers eligible', async (t) => {
    t.after(cleanupTmp);
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'bp-on-prod'), { recursive: true });
    const specDb = makeSpecDbStub({
      finderSettings: {
        bundlingEnabled: 'true',
        groupBundlingOnly: 'true',
        bundlingPassengerCost: JSON.stringify({ easy: 1, medium: 2, hard: 4, very_hard: 8 }),
        bundlingPoolPerPrimary: JSON.stringify({ easy: 6, medium: 4, hard: 2, very_hard: 1 }),
        passengerDifficultyPolicy: 'less_or_equal',
        budgetVariantPointsPerExtra: '1',
      },
    });
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'bp-on-prod', 'summary'], null, 'GET', {}, {});
    const byKey = Object.fromEntries(responses[0].body.map((r) => [r.field_key, r]));

    // polling_rate (medium, pool=4): sensor_model (very_hard) filtered by less_or_equal;
    //   acceleration (easy, cost 1) fits → [{field_key:'acceleration', cost:1}]
    assert.deepEqual(byKey.polling_rate.bundle_preview, [{ field_key: 'acceleration', cost: 1 }]);
    assert.equal(byKey.polling_rate.bundle_pool, 4, 'medium primary pool=4');
    assert.equal(byKey.polling_rate.bundle_total_cost, 1, '1 easy passenger @ cost 1');

    // sensor_model (very_hard, pool=1): polling_rate (medium, cost 2) doesn't fit;
    //   acceleration (easy, cost 1) fits → [{field_key:'acceleration', cost:1}]
    assert.deepEqual(byKey.sensor_model.bundle_preview, [{ field_key: 'acceleration', cost: 1 }]);
    assert.equal(byKey.sensor_model.bundle_pool, 1, 'very_hard primary pool=1');
    assert.equal(byKey.sensor_model.bundle_total_cost, 1);

    // acceleration (easy, pool=6): less_or_equal limits peers to easy; but in same group
    //   (sensor_performance) no other easy keys → []
    assert.deepEqual(byKey.acceleration.bundle_preview, []);
    assert.equal(byKey.acceleration.bundle_pool, 6, 'easy primary pool=6 surfaced even with 0 passengers');
    assert.equal(byKey.acceleration.bundle_total_cost, 0);

    // wireless_technology (connectivity group): no same-group peers → []
    assert.deepEqual(byKey.wireless_technology.bundle_preview, []);
  });

  it('bundle_preview excludes already-published peers', async (t) => {
    t.after(cleanupTmp);
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'bp-resolved-prod'), { recursive: true });
    const specDb = makeSpecDbStub({
      publishedKeys: new Set(['acceleration']),
      finderSettings: {
        bundlingEnabled: 'true',
        groupBundlingOnly: 'true',
        passengerDifficultyPolicy: 'less_or_equal',
        bundlingPassengerCost: JSON.stringify({ easy: 1, medium: 2, hard: 4, very_hard: 8 }),
        bundlingPoolPerPrimary: JSON.stringify({ easy: 6, medium: 4, hard: 2, very_hard: 1 }),
        budgetVariantPointsPerExtra: '1',
      },
    });
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'bp-resolved-prod', 'summary'], null, 'GET', {}, {});
    const byKey = Object.fromEntries(responses[0].body.map((r) => [r.field_key, r]));

    // acceleration already resolved → excluded from polling_rate's preview
    assert.deepEqual(byKey.polling_rate.bundle_preview, []);
    assert.deepEqual(byKey.sensor_model.bundle_preview, []);
  });

  it('GET /key-finder/:cat/:pid/bundling-config returns knobs + pool + cost + variantCount', async (t) => {
    t.after(cleanupTmp);
    const specDb = makeSpecDbStub({
      finderSettings: {
        bundlingEnabled: 'true',
        groupBundlingOnly: 'false',
        passengerDifficultyPolicy: 'same_only',
        bundlingPassengerCost: JSON.stringify({ easy: 1, medium: 2, hard: 4, very_hard: 8 }),
        bundlingPoolPerPrimary: JSON.stringify({ easy: 6, medium: 4, hard: 2, very_hard: 1 }),
      },
    });
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'pid-x', 'bundling-config'], null, 'GET', {}, {});

    assert.equal(responses[0].status, 200);
    const body = responses[0].body;
    assert.equal(body.enabled, true);
    assert.equal(body.groupBundlingOnly, false);
    assert.equal(body.passengerDifficultyPolicy, 'same_only');
    assert.deepEqual(body.poolPerPrimary, { easy: 6, medium: 4, hard: 2, very_hard: 1 });
    assert.deepEqual(body.passengerCost, { easy: 1, medium: 2, hard: 4, very_hard: 8 },
      'passenger cost is RAW — not variant-scaled');
    assert.equal(body.variantCount, 1, 'stub specDb has no variants → defaults to 1');
  });

  it('GET /key-finder/:cat/:pid/bundling-config returns defaults when settings unset', async (t) => {
    t.after(cleanupTmp);
    const specDb = makeSpecDbStub(); // no finderSettings → all reads return ''
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'pid-x', 'bundling-config'], null, 'GET', {}, {});

    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.enabled, false, 'default OFF');
    assert.equal(responses[0].body.groupBundlingOnly, true, 'default same-group only');
    assert.equal(responses[0].body.passengerDifficultyPolicy, 'less_or_equal', 'default policy');
  });

  it('bundle_preview surfaces cross-group peers when groupBundlingOnly=false', async (t) => {
    t.after(cleanupTmp);
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'bp-cross-prod'), { recursive: true });
    const specDb = makeSpecDbStub({
      finderSettings: {
        bundlingEnabled: 'true',
        groupBundlingOnly: 'false',
        bundlingPassengerCost: JSON.stringify({ easy: 1, medium: 2, hard: 4, very_hard: 8 }),
        bundlingPoolPerPrimary: JSON.stringify({ easy: 6, medium: 4, hard: 2, very_hard: 1 }),
        passengerDifficultyPolicy: 'less_or_equal',
        budgetVariantPointsPerExtra: '1',
      },
    });
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'bp-cross-prod', 'summary'], null, 'GET', {}, {});
    const byKey = Object.fromEntries(responses[0].body.map((r) => [r.field_key, r]));

    // wireless_technology (connectivity, easy, pool=6, mandatory+always):
    //   cross-group pulls acceleration (sensor_performance, easy, non-mand+sometimes, cost 1).
    //   less_or_equal from easy primary filters out medium+very_hard peers.
    assert.deepEqual(
      byKey.wireless_technology.bundle_preview,
      [{ field_key: 'acceleration', cost: 1 }],
      'easy primary picks up cross-group easy peer',
    );

    // polling_rate (sensor_performance, medium, pool=4):
    //   cross-group adds wireless_technology (easy, mandatory+always).
    //   Sort: required_level first → wireless_technology (mandatory) before acceleration (non-mand).
    //   Both easy (cost 1) fit in pool 4. sensor_model (very_hard) filtered by policy.
    assert.deepEqual(
      byKey.polling_rate.bundle_preview,
      [
        { field_key: 'wireless_technology', cost: 1 },
        { field_key: 'acceleration', cost: 1 },
      ],
      'medium primary picks up cross-group peers, mandatory sorts first',
    );
  });

  it('bundle_preview excludes a peer currently serving as primary in the registry', async (t) => {
    t.after(cleanupTmp);
    t.after(async () => {
      const reg = await import('../../../core/operations/keyFinderRegistry.js');
      reg._resetForTest();
    });
    const { register: registryRegister, _resetForTest: registryReset } = await import('../../../core/operations/keyFinderRegistry.js');
    registryReset();
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'bp-regprimary-prod'), { recursive: true });

    // Seed: acceleration is currently running as a primary elsewhere. When polling_rate
    // is previewed, buildPassengers must hard-block acceleration.
    registryRegister('bp-regprimary-prod', 'acceleration', 'primary');

    const specDb = makeSpecDbStub({
      finderSettings: {
        bundlingEnabled: 'true',
        groupBundlingOnly: 'true',
        bundlingPassengerCost: JSON.stringify({ easy: 1, medium: 2, hard: 4, very_hard: 8 }),
        bundlingPoolPerPrimary: JSON.stringify({ easy: 6, medium: 4, hard: 2, very_hard: 1 }),
        passengerDifficultyPolicy: 'less_or_equal',
        budgetVariantPointsPerExtra: '1',
      },
    });
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'bp-regprimary-prod', 'summary'], null, 'GET', {}, {});
    const byKey = Object.fromEntries(responses[0].body.map((r) => [r.field_key, r]));

    // polling_rate had acceleration as its only eligible peer (same group, policy-ok).
    // Registry says acceleration is a primary → hard-block → empty preview.
    assert.deepEqual(byKey.polling_rate.bundle_preview, [], 'primary-elsewhere peer hard-blocked');
  });

  it('bundle_preview is deterministic (sort stable under input order)', async (t) => {
    t.after(cleanupTmp);
    fs.mkdirSync(path.join(PRODUCT_ROOT, 'bp-stable-prod'), { recursive: true });
    // Add 3 easy peers to force the field_key tiebreaker
    const rules = {
      fields: {
        polling_rate: COMPILED_RULES_MOUSE.fields.polling_rate,
        zebra: { field_key: 'zebra', difficulty: 'easy', availability: 'always', required_level: 'mandatory', group: 'sensor_performance', ui: { label: 'Zebra' } },
        alpha: { field_key: 'alpha', difficulty: 'easy', availability: 'always', required_level: 'mandatory', group: 'sensor_performance', ui: { label: 'Alpha' } },
        mango: { field_key: 'mango', difficulty: 'easy', availability: 'always', required_level: 'mandatory', group: 'sensor_performance', ui: { label: 'Mango' } },
      },
    };
    const specDb = makeSpecDbStub({
      compiledRules: rules,
      finderSettings: {
        bundlingEnabled: 'true',
        groupBundlingOnly: 'true',
        bundlingPassengerCost: JSON.stringify({ easy: 1, medium: 2, hard: 4, very_hard: 8 }),
        bundlingPoolPerPrimary: JSON.stringify({ easy: 6, medium: 4, hard: 2, very_hard: 1 }),
        passengerDifficultyPolicy: 'less_or_equal',
        budgetVariantPointsPerExtra: '1',
      },
    });
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', 'bp-stable-prod', 'summary'], null, 'GET', {}, {});
    const byKey = Object.fromEntries(responses[0].body.map((r) => [r.field_key, r]));

    // polling_rate (medium, pool=4): alpha + mango + zebra all easy (cost 1) →
    //   all fit under pool=4; sort by field_key ASC
    assert.deepEqual(byKey.polling_rate.bundle_preview, [
      { field_key: 'alpha', cost: 1 },
      { field_key: 'mango', cost: 1 },
      { field_key: 'zebra', cost: 1 },
    ]);
  });
});
