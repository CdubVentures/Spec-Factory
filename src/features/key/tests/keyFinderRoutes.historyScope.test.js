/**
 * keyFinder route — GET /key-finder/:category/:productId?scope=group&group=X characterization.
 *
 * Scope-aware run history:
 *   - scope=key (default, legacy)     filter via field_key param
 *   - scope=group                     filter via compiledRules.fields[*].group === group
 *   - scope=product                   no filter (all runs for product)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { registerKeyFinderRoutes } from '../api/keyFinderRoutes.js';
import { mergeKeyFinderDiscovery } from '../keyStore.js';
import { initOperationsRegistry } from '../../../core/operations/index.js';

const COMPILED_RULES = {
  fields: {
    polling_rate:  { field_key: 'polling_rate',  group: 'sensor_performance' },
    sensor_model:  { field_key: 'sensor_model',  group: 'sensor_performance' },
    acceleration:  { field_key: 'acceleration',  group: 'sensor_performance' },
    wireless_technology: { field_key: 'wireless_technology', group: 'connectivity' },
  },
};

function makeCtx({ specDb, productRoot } = {}) {
  const responses = [];
  const broadcastWs = () => {};
  const ctx = {
    jsonRes: (res, status, body) => { responses.push({ status, body }); return body; },
    readJsonBody: async () => ({}),
    config: { productRoot },
    appDb: null,
    getSpecDb: () => specDb,
    broadcastWs,
    logger: { error: () => {}, info: () => {}, warn: () => {} },
  };
  initOperationsRegistry({ broadcastWs });
  return { ctx, responses };
}

function makeSpecDbStub({ hasRules = true } = {}) {
  return {
    category: 'mouse',
    getFieldCandidatesByProductAndField: () => [],
    getProduct: () => null,
    getCompiledRules: () => (hasRules ? COMPILED_RULES : null),
  };
}

function seedRun(productRoot, pid, fk, runNumber) {
  mergeKeyFinderDiscovery({
    productId: pid,
    productRoot,
    newDiscovery: { category: 'mouse', last_ran_at: `2024-03-15T10:0${runNumber}:00Z` },
    run: {
      started_at: `2024-03-15T10:0${runNumber}:00Z`, duration_ms: 1000, model: 'gpt-5.4-mini',
      fallback_used: false, thinking: true, web_search: true, effort_level: 'xhigh', access_mode: 'api',
      selected: { keys: {} },
      prompt: { system: 's', user: 'u' },
      response: {
        primary_field_key: fk,
        results: { [fk]: { value: 'v', confidence: 80, unknown_reason: '', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } } },
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      },
    },
  });
}

const TMP_ROOT = path.join(os.tmpdir(), `kf-history-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

function cleanupTmp() {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* */ }
}

describe('GET /key-finder/:category/:productId with scope param', () => {
  it('scope=group&group=sensor_performance filters runs by compiled-rule group', async (t) => {
    t.after(cleanupTmp);
    const pid = 'group-scope-prod';
    fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });

    seedRun(PRODUCT_ROOT, pid, 'polling_rate', 1);
    seedRun(PRODUCT_ROOT, pid, 'sensor_model', 2);
    seedRun(PRODUCT_ROOT, pid, 'wireless_technology', 3);

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    const params = new URLSearchParams({ scope: 'group', group: 'sensor_performance' });
    await handler(['key-finder', 'mouse', pid], params, 'GET', {}, {});

    assert.equal(responses[0].status, 200);
    const runs = responses[0].body.runs;
    assert.equal(runs.length, 2, 'only sensor_performance-group runs included');
    const keys = runs.map((r) => r.response.primary_field_key).sort();
    assert.deepEqual(keys, ['polling_rate', 'sensor_model']);
  });

  it('scope=product returns all runs (no filter)', async (t) => {
    t.after(cleanupTmp);
    const pid = 'product-scope-prod';
    fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });

    seedRun(PRODUCT_ROOT, pid, 'polling_rate', 1);
    seedRun(PRODUCT_ROOT, pid, 'wireless_technology', 2);
    seedRun(PRODUCT_ROOT, pid, 'acceleration', 3);

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    const params = new URLSearchParams({ scope: 'product' });
    await handler(['key-finder', 'mouse', pid], params, 'GET', {}, {});

    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.runs.length, 3);
  });

  it('default scope (no scope param, no field_key) behaves like legacy unfiltered', async (t) => {
    t.after(cleanupTmp);
    const pid = 'legacy-prod';
    fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });

    seedRun(PRODUCT_ROOT, pid, 'polling_rate', 1);
    seedRun(PRODUCT_ROOT, pid, 'sensor_model', 2);

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    const params = new URLSearchParams({});
    await handler(['key-finder', 'mouse', pid], params, 'GET', {}, {});

    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.runs.length, 2);
  });

  it('scope=group with missing compiled rules returns 404 rules_not_compiled', async (t) => {
    t.after(cleanupTmp);
    const pid = 'no-rules-prod';
    fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });

    seedRun(PRODUCT_ROOT, pid, 'polling_rate', 1);

    const specDb = makeSpecDbStub({ hasRules: false });
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    const params = new URLSearchParams({ scope: 'group', group: 'sensor_performance' });
    await handler(['key-finder', 'mouse', pid], params, 'GET', {}, {});

    assert.equal(responses[0].status, 404);
    assert.equal(responses[0].body.error, 'rules_not_compiled');
  });

  it('scope=key + field_key preserves existing filter behavior', async (t) => {
    t.after(cleanupTmp);
    const pid = 'key-scope-prod';
    fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });

    seedRun(PRODUCT_ROOT, pid, 'polling_rate', 1);
    seedRun(PRODUCT_ROOT, pid, 'sensor_model', 2);

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    const params = new URLSearchParams({ field_key: 'polling_rate' });
    await handler(['key-finder', 'mouse', pid], params, 'GET', {}, {});

    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.runs.length, 1);
    assert.equal(responses[0].body.runs[0].response.primary_field_key, 'polling_rate');
  });
});
