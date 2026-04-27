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
import { mergeKeyFinderDiscovery, readKeyFinder } from '../keyStore.js';
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
  const broadcasts = [];
  const broadcastWs = (channel, data) => { broadcasts.push({ channel, data }); };
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
  return { ctx, responses, broadcasts };
}

function makeSpecDbStub({ hasRules = true, finderStore = null } = {}) {
  return {
    category: 'mouse',
    getFieldCandidatesByProductAndField: () => [],
    getProduct: () => null,
    getCompiledRules: () => (hasRules ? COMPILED_RULES : null),
    getFinderStore: () => finderStore,
  };
}

function makeSqlRun(pid, fk, runNumber, perKey = { value: 'sql-v', confidence: 91, unknown_reason: '', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } }) {
  return {
    category: 'mouse',
    product_id: pid,
    run_number: runNumber,
    ran_at: `2026-04-20T10:0${runNumber}:00Z`,
    started_at: `2026-04-20T10:0${runNumber}:00Z`,
    duration_ms: 1000,
    model: 'sql-model',
    fallback_used: false,
    thinking: true,
    web_search: true,
    effort_level: 'xhigh',
    access_mode: 'api',
    selected: { keys: { [fk]: perKey } },
    prompt: { system: 'sql-s', user: 'sql-u' },
    response: {
      primary_field_key: fk,
      results: { [fk]: perKey },
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    },
  };
}

function seedRun(productRoot, pid, fk, runNumber, perKey = { value: 'v', confidence: 80, unknown_reason: '', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } }) {
  mergeKeyFinderDiscovery({
    productId: pid,
    productRoot,
    newDiscovery: { category: 'mouse', last_ran_at: `2024-03-15T10:0${runNumber}:00Z` },
    run: {
      started_at: `2024-03-15T10:0${runNumber}:00Z`, duration_ms: 1000, model: 'gpt-5.4-mini',
      fallback_used: false, thinking: true, web_search: true, effort_level: 'xhigh', access_mode: 'api',
      selected: { keys: { [fk]: perKey } },
      prompt: { system: 's', user: 'u' },
      response: {
        primary_field_key: fk,
        results: { [fk]: perKey },
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

  it('scope=product reads SQL runs instead of a stale key_finder.json mirror', async (t) => {
    t.after(cleanupTmp);
    const pid = 'sql-detail-prod';
    fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });

    seedRun(PRODUCT_ROOT, pid, 'sensor_model', 1, {
      value: 'json-stale',
      confidence: 80,
      unknown_reason: '',
      evidence_refs: [],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    });

    const finderStore = {
      get: (productId) => ({ category: 'mouse', product_id: productId, latest_ran_at: '2026-04-20T10:07:00Z', run_count: 1 }),
      listRuns: (productId) => [makeSqlRun(productId, 'polling_rate', 7, {
        value: 8000,
        confidence: 93,
        unknown_reason: '',
        evidence_refs: [],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      })],
    };
    const specDb = makeSpecDbStub({ finderStore });
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    const params = new URLSearchParams({ scope: 'product' });
    await handler(['key-finder', 'mouse', pid], params, 'GET', {}, {});

    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.runs.length, 1);
    assert.equal(responses[0].body.runs[0].run_number, 7);
    assert.equal(responses[0].body.runs[0].response.primary_field_key, 'polling_rate');
    assert.equal(responses[0].body.selected.keys.polling_rate.value, 8000);
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

  it('normalizes legacy run-history unk sentinels to null before response', async (t) => {
    t.after(cleanupTmp);
    const pid = 'legacy-unk-prod';
    fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });

    seedRun(PRODUCT_ROOT, pid, 'sensor_model', 1, {
      value: 'UNK',
      confidence: 0,
      unknown_reason: 'not disclosed',
      evidence_refs: [],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    });

    const specDb = makeSpecDbStub();
    const { ctx, responses } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    const handler = registerKeyFinderRoutes(ctx);

    const params = new URLSearchParams({ scope: 'key', field_key: 'sensor_model' });
    await handler(['key-finder', 'mouse', pid], params, 'GET', {}, {});

    assert.equal(responses[0].status, 200);
    const run = responses[0].body.runs[0];
    assert.equal(run.response.results.sensor_model.value, null);
    assert.equal(run.selected.keys.sensor_model.value, null);
    assert.equal(run.response.results.sensor_model.unknown_reason, 'not disclosed');
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

  it('POST discovery-history/scrub clears primary key history without clearing passenger-only shared sessions', async (t) => {
    t.after(cleanupTmp);
    const pid = 'key-scrub-prod';
    fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });

    mergeKeyFinderDiscovery({
      productId: pid,
      productRoot: PRODUCT_ROOT,
      newDiscovery: { category: 'mouse', last_ran_at: '2024-03-15T10:01:00Z' },
      run: {
        model: 'gpt-5.4-mini',
        selected: { keys: { polling_rate: { value: '8000Hz' }, sensor_model: { value: 'Focus Pro' } } },
        prompt: { system: 's', user: 'u' },
        response: {
          primary_field_key: 'polling_rate',
          results: { polling_rate: { value: '8000Hz' }, sensor_model: { value: 'Focus Pro' } },
          discovery_log: {
            urls_checked: ['https://primary.example'],
            queries_run: ['polling rate query'],
            notes: ['keep primary note'],
          },
        },
      },
    });
    mergeKeyFinderDiscovery({
      productId: pid,
      productRoot: PRODUCT_ROOT,
      newDiscovery: { category: 'mouse', last_ran_at: '2024-03-15T10:02:00Z' },
      run: {
        model: 'gpt-5.4-mini',
        selected: { keys: { sensor_model: { value: 'Focus Pro' }, polling_rate: { value: '8000Hz' } } },
        prompt: { system: 's2', user: 'u2' },
        response: {
          primary_field_key: 'sensor_model',
          results: { sensor_model: { value: 'Focus Pro' }, polling_rate: { value: '8000Hz' } },
          discovery_log: {
            urls_checked: ['https://passenger.example'],
            queries_run: ['sensor model query'],
            notes: ['keep passenger note'],
          },
        },
      },
    });

    const sqlUpdates = [];
    const specDb = makeSpecDbStub({
      finderStore: {
        updateRunJson: (productId, runNumber, payload) => sqlUpdates.push({ productId, runNumber, payload }),
      },
    });
    const { ctx, responses, broadcasts } = makeCtx({ specDb, productRoot: PRODUCT_ROOT });
    ctx.readJsonBody = async () => ({ kind: 'all', scope: 'field_key', fieldKey: 'polling_rate' });
    const handler = registerKeyFinderRoutes(ctx);

    await handler(['key-finder', 'mouse', pid, 'discovery-history', 'scrub'], null, 'POST', {}, {});

    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.runsTouched, 1);
    assert.deepEqual(responses[0].body.affectedRunNumbers, [1]);
    assert.deepEqual(sqlUpdates.map((u) => u.runNumber), [1]);

    const doc = readKeyFinder({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.deepEqual(doc.selected.keys.polling_rate, { value: '8000Hz' });
    assert.deepEqual(doc.runs[0].response.discovery_log.urls_checked, []);
    assert.deepEqual(doc.runs[0].response.discovery_log.queries_run, []);
    assert.deepEqual(doc.runs[0].response.discovery_log.notes, ['keep primary note']);
    assert.deepEqual(doc.runs[1].response.discovery_log.urls_checked, ['https://passenger.example']);
    assert.deepEqual(doc.runs[1].response.discovery_log.queries_run, ['sensor model query']);

    const events = broadcasts
      .filter((m) => m.channel === 'data-change')
      .map((m) => m.data.event);
    assert.ok(events.includes('key-finder-discovery-history-scrubbed'));
  });
});
