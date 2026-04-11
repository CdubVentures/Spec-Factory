import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFinderRouteHandler } from '../finderRoutes.js';

function makeJsonCapture() {
  const calls = [];
  const jsonRes = (res, status, body) => { calls.push({ status, body }); return true; };
  return { jsonRes, calls };
}

function makeSpecDbStub(overrides = {}) {
  const candidateDeleteCalls = [];
  return {
    getProduct: () => overrides.productRow ?? { product_id: 'p1', category: 'cat', brand: 'B', model: 'M', variant: '' },
    deleteFieldCandidatesByProductAndField: (...args) => candidateDeleteCalls.push(args),
    _candidateDeleteCalls: candidateDeleteCalls,
    category: 'cat',
  };
}

function makeFinderConfig(overrides = {}) {
  return {
    routePrefix: 'test-finder',
    moduleType: 'tf',
    phase: 'testFinder',
    fieldKeys: ['field_a', 'field_b'],
    runFinder: overrides.runFinder || (async () => ({ rejected: false })),
    deleteRun: overrides.deleteRun || (() => null),
    deleteAll: overrides.deleteAll || (() => ({ deleted: true })),
    getOne: overrides.getOne || (() => ({ product_id: 'p1', category: 'cat', cooldown_until: '', latest_ran_at: '', run_count: 1 })),
    listByCategory: overrides.listByCategory || (() => []),
    listRuns: overrides.listRuns || (() => []),
    upsertSummary: overrides.upsertSummary || (() => {}),
    deleteOneSql: overrides.deleteOneSql || (() => {}),
    deleteRunSql: overrides.deleteRunSql || (() => {}),
    deleteAllRunsSql: overrides.deleteAllRunsSql || (() => {}),
  };
}

function makeCtx(specDbOverrides = {}) {
  const { jsonRes, calls } = makeJsonCapture();
  const specDb = makeSpecDbStub(specDbOverrides);
  return {
    ctx: {
      jsonRes,
      readJsonBody: async () => ({}),
      config: {},
      appDb: { listColors: () => [] },
      getSpecDb: () => specDb,
      broadcastWs: () => {},
      logger: null,
    },
    calls,
    specDb,
  };
}

describe('createFinderRouteHandler — generic', () => {
  it('returns false for unrecognized prefix', async () => {
    const { ctx } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig())(ctx);
    const result = await handler(['other-thing', 'cat'], new Map(), 'GET', {}, {});
    assert.equal(result, false);
  });

  // ── GET list ──────────────────────────────────────────────────────

  it('GET list returns rows from listByCategory', async () => {
    const rows = [{ product_id: 'p1' }, { product_id: 'p2' }];
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      listByCategory: () => rows,
    }))(ctx);
    await handler(['test-finder', 'cat'], new Map(), 'GET', {}, {});
    assert.equal(calls[0].status, 200);
    assert.deepEqual(calls[0].body, rows);
  });

  // ── GET single ────────────────────────────────────────────────────

  it('GET single returns 404 when not found', async () => {
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      getOne: () => null,
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'GET', {}, {});
    assert.equal(calls[0].status, 404);
  });

  it('GET single returns row with runs and selected', async () => {
    const row = { product_id: 'p1', category: 'cat', cooldown_until: '', latest_ran_at: '2026-04-01', run_count: 1 };
    const runs = [{ run_number: 1, selected: { items: ['a'] } }];
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      getOne: () => row,
      listRuns: () => runs,
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'GET', {}, {});
    assert.equal(calls[0].status, 200);
    assert.ok(calls[0].body.selected);
    assert.ok(Array.isArray(calls[0].body.runs));
  });

  // ── POST trigger ──────────────────────────────────────────────────

  it('POST triggers finder and returns 200', async () => {
    let called = false;
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      runFinder: async () => { called = true; return { rejected: false }; },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'POST', {}, {});
    assert.ok(called);
    assert.equal(calls[0].status, 200);
    assert.equal(calls[0].body.ok, true);
  });

  it('POST returns rejected result as 200 with ok:true', async () => {
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      runFinder: async () => ({ rejected: true, rejections: [{ reason_code: 'test' }] }),
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'POST', {}, {});
    assert.equal(calls[0].status, 200);
  });

  // ── DELETE single run ─────────────────────────────────────────────

  it('DELETE single run returns remaining count', async () => {
    let deletedRun = null;
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRun: ({ runNumber }) => { deletedRun = runNumber; return { run_count: 1, selected: {}, cooldown_until: '', last_ran_at: '' }; },
      deleteRunSql: () => {},
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', '3'], new Map(), 'DELETE', {}, {});
    assert.equal(calls[0].status, 200);
    assert.equal(calls[0].body.remaining_runs, 1);
    assert.equal(deletedRun, 3);
  });

  it('DELETE rejects invalid run number', async () => {
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig())(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', 'abc'], new Map(), 'DELETE', {}, {});
    assert.equal(calls[0].status, 400);
  });

  // ── DELETE all ────────────────────────────────────────────────────

  it('DELETE all removes data and cleans up candidates', async () => {
    let allDeleted = false;
    const { ctx, calls, specDb } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteAll: () => { allDeleted = true; return { deleted: true }; },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'DELETE', {}, {});
    assert.equal(calls[0].status, 200);
    assert.ok(allDeleted);
    // Candidates cleaned for each fieldKey
    assert.equal(specDb._candidateDeleteCalls.length, 2);
  });

  it('DELETE single run does NOT delete candidates', async () => {
    const { ctx, specDb } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRun: () => ({ run_count: 1, selected: {}, cooldown_until: '', last_ran_at: '' }),
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', '1'], new Map(), 'DELETE', {}, {});
    assert.equal(specDb._candidateDeleteCalls.length, 0);
  });
});
