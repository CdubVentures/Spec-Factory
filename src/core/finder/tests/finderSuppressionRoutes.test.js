// WHY: Route contract for the universal suppressions endpoints baked into
// createFinderRouteHandler. Uses an in-memory specDb + the RDF registrar as a
// concrete test vehicle (same handler path applies to CEF and PIF).

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { generateFinderDdl } from '../finderSqlDdl.js';
import { createFinderSqlStore } from '../finderSqlStore.js';
import { createFinderRouteHandler } from '../finderRoutes.js';

const TEST_MODULE = {
  id: 'testFinder',
  tableName: 'test_finder',
  runsTableName: 'test_finder_runs',
  summaryColumns: [],
  settingsSchema: [],
};

function fakeRes() {
  const r = { status: null, body: null };
  return { r, jsonRes: (_res, status, body) => { r.status = status; r.body = body; } };
}

function setup() {
  const db = new Database(':memory:');
  for (const stmt of generateFinderDdl([TEST_MODULE])) db.exec(stmt);
  const store = createFinderSqlStore({ db, category: 'mouse', module: TEST_MODULE });
  const specDb = { getFinderStore: (id) => (id === 'testFinder' ? store : null) };
  const { r, jsonRes } = fakeRes();

  const handler = createFinderRouteHandler({
    routePrefix: 'test-finder',
    moduleId: 'testFinder',
    fieldKeys: [],
    getOne: (_db, pid) => store.get(pid),
    listByCategory: (_db, cat) => store.listByCategory(cat),
    listRuns: (_db, pid) => store.listRuns(pid),
    upsertSummary: (_db, row) => store.upsert(row),
    deleteOneSql: (_db, pid) => store.remove(pid),
    deleteRunSql: (_db, pid, rn) => store.removeRun(pid, rn),
    deleteAllRunsSql: (_db, pid) => store.removeAllRuns(pid),
    runFinder: async () => ({ ok: true }),
    deleteRun: () => {},
    deleteAll: () => {},
  })({
    jsonRes,
    readJsonBody: async (req) => req.body || {},
    config: {}, appDb: null,
    getSpecDb: () => specDb,
    broadcastWs: () => {},
    logger: null,
  });

  return { handler, store, r };
}

function parts(path) { return path.split('/').filter(Boolean); }

describe('suppressions routes via createFinderRouteHandler', () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it('GET returns empty list on fresh product', async () => {
    await ctx.handler(parts('test-finder/mouse/p1/suppressions'), {}, 'GET', {}, {});
    assert.equal(ctx.r.status, 200);
    assert.deepEqual(ctx.r.body.suppressions, []);
  });

  it('POST adds a suppression; GET returns it', async () => {
    await ctx.handler(parts('test-finder/mouse/p1/suppressions'), {}, 'POST',
      { body: { item: 'https://x.com', kind: 'url', variant_id: 'v_black' } }, {});
    assert.equal(ctx.r.status, 200);
    assert.equal(ctx.r.body.ok, true);

    await ctx.handler(parts('test-finder/mouse/p1/suppressions'), {}, 'GET', {}, {});
    assert.equal(ctx.r.body.suppressions.length, 1);
    assert.equal(ctx.r.body.suppressions[0].item, 'https://x.com');
  });

  it('POST rejects missing item', async () => {
    await ctx.handler(parts('test-finder/mouse/p1/suppressions'), {}, 'POST', { body: { kind: 'url' } }, {});
    assert.equal(ctx.r.status, 400);
  });

  it('POST rejects bad kind', async () => {
    await ctx.handler(parts('test-finder/mouse/p1/suppressions'), {}, 'POST',
      { body: { item: 'x', kind: 'bogus' } }, {});
    assert.equal(ctx.r.status, 400);
  });

  it('DELETE /item removes a single suppression', async () => {
    ctx.store.addSuppression('p1', { item: 'x', kind: 'url', variant_id: 'v_black' });
    ctx.store.addSuppression('p1', { item: 'y', kind: 'url', variant_id: 'v_black' });

    await ctx.handler(parts('test-finder/mouse/p1/suppressions/item'), {}, 'DELETE',
      { body: { item: 'x', kind: 'url', variant_id: 'v_black' } }, {});
    assert.equal(ctx.r.status, 200);
    assert.equal(ctx.store.listSuppressions('p1').length, 1);
  });

  it('DELETE with variantId query param wipes that scope only', async () => {
    ctx.store.addSuppression('p1', { item: 'x', kind: 'url', variant_id: 'v_black' });
    ctx.store.addSuppression('p1', { item: 'y', kind: 'url', variant_id: 'v_white' });

    await ctx.handler(parts('test-finder/mouse/p1/suppressions'), { variantId: 'v_black' }, 'DELETE', {}, {});
    const remaining = ctx.store.listSuppressions('p1');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].variant_id, 'v_white');
  });

  it('DELETE /all wipes everything for the product', async () => {
    ctx.store.addSuppression('p1', { item: 'x', kind: 'url' });
    ctx.store.addSuppression('p1', { item: 'y', kind: 'query' });
    ctx.store.addSuppression('p2', { item: 'z', kind: 'url' });

    await ctx.handler(parts('test-finder/mouse/p1/suppressions/all'), {}, 'DELETE', {}, {});
    assert.equal(ctx.r.status, 200);
    assert.equal(ctx.store.listSuppressions('p1').length, 0);
    assert.equal(ctx.store.listSuppressions('p2').length, 1, 'other product untouched');
  });
});
