import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFinderRouteHandler } from '../finderRoutes.js';
import { initOperationsRegistry } from '../../operations/index.js';

const ROUTE_TMP_ROOT = path.join(os.tmpdir(), `finder-routes-test-${Date.now()}`);

function makeRollbackTracker() {
  const committedDeletes = [];
  let pendingDeletes = [];
  let insideTransaction = false;

  return {
    db: {
      transaction: (work) => () => {
        insideTransaction = true;
        pendingDeletes = [];
        try {
          const result = work();
          committedDeletes.push(...pendingDeletes);
          return result;
        } catch (err) {
          pendingDeletes = [];
          throw err;
        } finally {
          insideTransaction = false;
        }
      },
    },
    recordDelete: (entry) => {
      if (insideTransaction) {
        pendingDeletes.push(entry);
        return;
      }
      committedDeletes.push(entry);
    },
    committedDeletes,
  };
}

function makeJsonCapture() {
  const calls = [];
  const jsonRes = (res, status, body) => { calls.push({ status, body }); return true; };
  return { jsonRes, calls };
}

function makeSpecDbStub(overrides = {}) {
  const candidateDeleteCalls = [];
  return {
    db: overrides.db,
    getProduct: () => (
      Object.hasOwn(overrides, 'productRow')
        ? overrides.productRow
        : { product_id: 'p1', category: 'cat', brand: 'B', model: 'M', base_model: 'BM', variant: '' }
    ),
    getCompiledRules: () => ({ fields: { field_a: { key: 'field_a' } } }),
    deleteFieldCandidatesByProductAndField: (...args) => candidateDeleteCalls.push(args),
    getFinderStore: () => overrides.finderStore ?? null,
    _candidateDeleteCalls: candidateDeleteCalls,
    category: 'cat',
  };
}

function makeFinderConfig(overrides = {}) {
  return {
    routePrefix: overrides.routePrefix || 'test-finder',
    moduleId: overrides.moduleId || 'testFinder',
    moduleType: 'tf',
    phase: 'testFinder',
    fieldKeys: overrides.fieldKeys || ['field_a', 'field_b'],
    runFinder: overrides.runFinder || (async () => ({ rejected: false })),
    deleteRun: overrides.deleteRun || (() => null),
    deleteRuns: overrides.deleteRuns || undefined,
    deleteAll: overrides.deleteAll || (() => ({ deleted: true })),
    getOne: overrides.getOne || (() => ({ product_id: 'p1', category: 'cat', latest_ran_at: '', run_count: 1 })),
    listByCategory: overrides.listByCategory || (() => []),
    listRuns: overrides.listRuns || (() => []),
    upsertSummary: overrides.upsertSummary || (() => {}),
    updateBookkeeping: overrides.updateBookkeeping || undefined,
    deleteOneSql: overrides.deleteOneSql || (() => {}),
    deleteRunSql: overrides.deleteRunSql || (() => {}),
    deleteAllRunsSql: overrides.deleteAllRunsSql || (() => {}),
    skipSelectedOnDelete: overrides.skipSelectedOnDelete || false,
    parseVariantKey: overrides.parseVariantKey || false,
    loop: overrides.loop || undefined,
    customStages: overrides.customStages || undefined,
    onAfterDeleteAll: overrides.onAfterDeleteAll || undefined,
    buildGetResponse: overrides.buildGetResponse || undefined,
  };
}

function makeCtx(specDbOverrides = {}) {
  const { jsonRes, calls } = makeJsonCapture();
  const specDb = makeSpecDbStub(specDbOverrides);
  const wsMessages = [];
  const broadcastWs = (channel, data) => { wsMessages.push({ channel, data }); };
  // WHY: operations registry broadcasts via a module-level hook set once at boot.
  // Wire it to our per-test spy so op lifecycle WS events are observable.
  initOperationsRegistry({ broadcastWs });
  return {
    ctx: {
      jsonRes,
      readJsonBody: async () => ({}),
      config: specDbOverrides.config || {},
      appDb: { listColors: () => [] },
      getSpecDb: () => specDb,
      broadcastWs,
      logger: null,
    },
    calls,
    specDb,
    wsMessages,
  };
}

function writeFinderDoc({ productId, filePrefix, doc }) {
  const dir = path.join(ROUTE_TMP_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${filePrefix}.json`), JSON.stringify(doc, null, 2), 'utf8');
}

function readFinderDoc(productId, filePrefix) {
  return JSON.parse(fs.readFileSync(path.join(ROUTE_TMP_ROOT, productId, `${filePrefix}.json`), 'utf8'));
}

async function flushAsyncWork() {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 10));
}

function getOperationsUpserts(wsMessages) {
  return wsMessages
    .filter((m) => m.channel === 'operations' && m.data?.action === 'upsert')
    .map((m) => m.data.operation);
}

describe('createFinderRouteHandler — generic', () => {
  before(() => fs.mkdirSync(ROUTE_TMP_ROOT, { recursive: true }));
  after(() => { fs.rmSync(ROUTE_TMP_ROOT, { recursive: true, force: true }); });

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

  it('GET single returns 404 when the product is not found', async () => {
    const { ctx, calls } = makeCtx({ productRow: null });
    const handler = createFinderRouteHandler(makeFinderConfig({
      getOne: () => null,
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'GET', {}, {});
    assert.equal(calls[0].status, 404);
  });

  it('GET single returns an empty entity for an existing product with no finder row yet', async () => {
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      getOne: () => null,
      listRuns: () => [],
    }))(ctx);

    await handler(['test-finder', 'cat', 'p1'], new Map(), 'GET', {}, {});

    assert.equal(calls[0].status, 200);
    assert.deepEqual(calls[0].body, {
      product_id: 'p1',
      category: 'cat',
      run_count: 0,
      last_ran_at: '',
      selected: {},
      runs: [],
    });
  });

  it('GET single returns row with runs and selected', async () => {
    const row = { product_id: 'p1', category: 'cat', latest_ran_at: '2026-04-01', run_count: 1 };
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

  it('POST triggers finder and returns 202 with operationId', async () => {
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      runFinder: async () => ({ rejected: false }),
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'POST', {}, {});
    assert.equal(calls[0].status, 202);
    assert.equal(calls[0].body.ok, true);
    assert.ok(calls[0].body.operationId, 'response must include operationId');
  });

  it('POST returns 202 even for rejected results', async () => {
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      runFinder: async () => ({ rejected: true, rejections: [{ reason_code: 'test' }] }),
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'POST', {}, {});
    assert.equal(calls[0].status, 202);
    assert.ok(calls[0].body.operationId);
  });

  // ── DELETE single run ─────────────────────────────────────────────

  it('DELETE single run returns remaining count', async () => {
    let deletedRun = null;
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRun: ({ runNumber }) => { deletedRun = runNumber; return { run_count: 1, selected: {}, last_ran_at: '' }; },
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

  it('DELETE single run rolls back SQL when JSON run mirror delete fails', async () => {
    const tracker = makeRollbackTracker();
    const { ctx } = makeCtx({ db: tracker.db });
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRun: () => {
        throw new Error('JSON delete failed');
      },
      deleteRunSql: (_specDb, productId, runNumber) => {
        tracker.recordDelete({ productId, runNumber });
      },
    }))(ctx);

    await assert.rejects(
      () => handler(['test-finder', 'cat', 'p1', 'runs', '1'], new Map(), 'DELETE', {}, {}),
      /JSON delete failed/,
    );

    assert.deepEqual(tracker.committedDeletes, []);
  });

  // ── DELETE all ────────────────────────────────────────────────────

  it('DELETE single run returns the canonical changed finder entity', async () => {
    let row = {
      product_id: 'p1',
      category: 'cat',
      latest_ran_at: '2026-04-27T00:00:00.000Z',
      run_count: 2,
    };
    const runs = [{ run_number: 1, selected: { value: 'survivor' } }];
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRun: () => ({ run_count: 1, selected: { value: 'survivor' }, last_ran_at: '2026-04-27T01:00:00.000Z' }),
      deleteRunSql: () => {},
      getOne: () => row,
      listRuns: () => runs,
      upsertSummary: (_specDb, nextRow) => {
        row = { ...row, ...nextRow };
      },
      buildGetResponse: (changedRow, selected, runRows) => ({
        product_id: changedRow.product_id,
        run_count: changedRow.run_count,
        last_ran_at: changedRow.latest_ran_at,
        selected,
        runs: runRows,
      }),
    }))(ctx);

    await handler(['test-finder', 'cat', 'p1', 'runs', '2'], new Map(), 'DELETE', {}, {});

    assert.equal(calls[0].status, 200);
    assert.equal(calls[0].body.remaining_runs, 1);
    assert.deepEqual(calls[0].body.entity, {
      product_id: 'p1',
      run_count: 1,
      last_ran_at: '2026-04-27T01:00:00.000Z',
      selected: { value: 'survivor' },
      runs,
    });
  });

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

  // ── onAfterDeleteAll cascade hook ─────────────────────────────────
  // WHY: PIF/CEF "Delete All" must wipe everything (variants, images,
  // evals, projections), not just runs. The hook fires only on delete-all
  // so single-run delete keeps its narrower semantics.

  it('DELETE all invokes onAfterDeleteAll hook with full context', async () => {
    let hookCalls = [];
    const { ctx } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      onAfterDeleteAll: (opts) => { hookCalls.push(opts); },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'DELETE', {}, {});
    assert.equal(hookCalls.length, 1, 'onAfterDeleteAll must fire exactly once on delete-all');
    assert.equal(hookCalls[0].productId, 'p1');
    assert.equal(hookCalls[0].category, 'cat');
    assert.ok(hookCalls[0].specDb, 'hook receives specDb');
    assert.ok('productRoot' in hookCalls[0], 'hook receives productRoot');
  });

  it('DELETE all rolls back SQL cleanup when reset cascade hook fails', async () => {
    const tracker = makeRollbackTracker();
    const { ctx } = makeCtx({ db: tracker.db });
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteAllRunsSql: (_specDb, productId) => {
        tracker.recordDelete({ productId, kind: 'runs' });
      },
      deleteOneSql: (_specDb, productId) => {
        tracker.recordDelete({ productId, kind: 'summary' });
      },
      upsertSummary: (_specDb, row) => {
        tracker.recordDelete({ productId: row.product_id, kind: 'summary-upsert' });
      },
      onAfterDeleteAll: () => {
        throw new Error('reset cascade failed');
      },
    }))(ctx);

    await assert.rejects(
      () => handler(['test-finder', 'cat', 'p1'], new Map(), 'DELETE', {}, {}),
      /reset cascade failed/,
    );

    assert.deepEqual(tracker.committedDeletes, []);
  });

  it('DELETE all does not delete JSON mirror before SQL cleanup succeeds', async () => {
    const calls = [];
    const { ctx } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteAll: () => {
        calls.push('json-delete');
        return { deleted: true };
      },
      deleteAllRunsSql: () => {
        calls.push('sql-runs-delete');
        throw new Error('SQL cleanup failed');
      },
    }))(ctx);

    await assert.rejects(
      () => handler(['test-finder', 'cat', 'p1'], new Map(), 'DELETE', {}, {}),
      /SQL cleanup failed/,
    );

    assert.deepEqual(calls, ['sql-runs-delete']);
  });

  it('DELETE all returns the canonical reset finder entity', async () => {
    let row = {
      product_id: 'p1',
      category: 'cat',
      latest_ran_at: '2026-04-27T00:00:00.000Z',
      run_count: 3,
    };
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteAllRunsSql: () => {},
      getOne: () => row,
      listRuns: () => [],
      upsertSummary: (_specDb, nextRow) => {
        row = { ...row, ...nextRow };
      },
      buildGetResponse: (changedRow, selected, runRows) => ({
        product_id: changedRow.product_id,
        run_count: changedRow.run_count,
        last_ran_at: changedRow.latest_ran_at,
        selected,
        runs: runRows,
      }),
    }))(ctx);

    await handler(['test-finder', 'cat', 'p1'], new Map(), 'DELETE', {}, {});

    assert.equal(calls[0].status, 200);
    assert.deepEqual(calls[0].body.entity, {
      product_id: 'p1',
      run_count: 0,
      last_ran_at: '',
      selected: {},
      runs: [],
    });
  });

  it('DELETE single run does NOT invoke onAfterDeleteAll hook', async () => {
    let hookFired = false;
    const { ctx } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRun: () => ({ run_count: 1, selected: {}, last_ran_at: '' }),
      onAfterDeleteAll: () => { hookFired = true; },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', '3'], new Map(), 'DELETE', {}, {});
    assert.equal(hookFired, false, 'onAfterDeleteAll must NOT fire on single-run delete');
  });

  it('DELETE batch runs does NOT invoke onAfterDeleteAll hook', async () => {
    let hookFired = false;
    const { ctx } = makeCtx();
    ctx.readJsonBody = async () => ({ runNumbers: [1, 2] });
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRuns: () => ({ run_count: 0, selected: {}, last_ran_at: '' }),
      onAfterDeleteAll: () => { hookFired = true; },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', 'batch'], new Map(), 'DELETE', {}, {});
    assert.equal(hookFired, false, 'onAfterDeleteAll must NOT fire on batch run delete');
  });

  // ── DELETE batch runs ────────────────────────────────────────────

  it('DELETE batch returns remaining count after removing specified runs', async () => {
    const deletedNumbers = [];
    const { ctx, calls } = makeCtx();
    ctx.readJsonBody = async () => ({ runNumbers: [2, 3] });
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRuns: ({ runNumbers }) => { deletedNumbers.push(...runNumbers); return { run_count: 1, selected: {}, last_ran_at: '' }; },
      deleteRunSql: () => {},
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', 'batch'], new Map(), 'DELETE', {}, {});
    assert.equal(calls[0].status, 200);
    assert.equal(calls[0].body.remaining_runs, 1);
    assert.deepEqual(deletedNumbers, [2, 3]);
  });

  it('DELETE batch rolls back SQL when JSON run mirror delete fails', async () => {
    const tracker = makeRollbackTracker();
    const { ctx } = makeCtx({ db: tracker.db });
    ctx.readJsonBody = async () => ({ runNumbers: [1, 2] });
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRuns: () => {
        throw new Error('JSON batch delete failed');
      },
      deleteRunSql: (_specDb, productId, runNumber) => {
        tracker.recordDelete({ productId, runNumber });
      },
    }))(ctx);

    await assert.rejects(
      () => handler(['test-finder', 'cat', 'p1', 'runs', 'batch'], new Map(), 'DELETE', {}, {}),
      /JSON batch delete failed/,
    );

    assert.deepEqual(tracker.committedDeletes, []);
  });

  it('DELETE batch returns 400 for missing runNumbers', async () => {
    const { ctx, calls } = makeCtx();
    ctx.readJsonBody = async () => ({});
    const handler = createFinderRouteHandler(makeFinderConfig())(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', 'batch'], new Map(), 'DELETE', {}, {});
    assert.equal(calls[0].status, 400);
  });

  it('DELETE batch returns 400 for non-array runNumbers', async () => {
    const { ctx, calls } = makeCtx();
    ctx.readJsonBody = async () => ({ runNumbers: 'not-array' });
    const handler = createFinderRouteHandler(makeFinderConfig())(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', 'batch'], new Map(), 'DELETE', {}, {});
    assert.equal(calls[0].status, 400);
  });

  it('DELETE batch returns 400 for empty runNumbers array', async () => {
    const { ctx, calls } = makeCtx();
    ctx.readJsonBody = async () => ({ runNumbers: [] });
    const handler = createFinderRouteHandler(makeFinderConfig())(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', 'batch'], new Map(), 'DELETE', {}, {});
    assert.equal(calls[0].status, 400);
  });

  it('DELETE batch when all runs removed → cleans up SQL rows', async () => {
    let sqlDeletedAll = false;
    let sqlDeletedOne = false;
    const { ctx, calls } = makeCtx();
    ctx.readJsonBody = async () => ({ runNumbers: [1, 2] });
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRuns: () => null,
      deleteRunSql: () => {},
      deleteAllRunsSql: () => { sqlDeletedAll = true; },
      deleteOneSql: () => { sqlDeletedOne = true; },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', 'batch'], new Map(), 'DELETE', {}, {});
    assert.equal(calls[0].status, 200);
    assert.equal(calls[0].body.remaining_runs, 0);
    assert.ok(sqlDeletedAll, 'should delete all SQL runs');
    assert.ok(sqlDeletedOne, 'should delete summary row');
  });

  it('DELETE single run does NOT delete candidates', async () => {
    const { ctx, specDb } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRun: () => ({ run_count: 1, selected: {}, last_ran_at: '' }),
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', '1'], new Map(), 'DELETE', {}, {});
    assert.equal(specDb._candidateDeleteCalls.length, 0);
  });

  // ── skipSelectedOnDelete: bookkeeping-only updates ─────────────

  it('POST discovery-history/scrub clears only matching discovery-log arrays and emits a narrow data-change event', async () => {
    const productId = 'route-scrub-rdf';
    const filePrefix = 'release_date';
    writeFinderDoc({
      productId,
      filePrefix,
      doc: {
        product_id: productId,
        category: 'cat',
        selected: { candidates: [{ variant_id: 'v_black', value: '2025-01-01' }] },
        run_count: 2,
        next_run_number: 3,
        runs: [
          {
            run_number: 1,
            selected: { candidates: [{ variant_id: 'v_black', value: '2025-01-01' }] },
            prompt: { user: 'keep prompt' },
            response: {
              variant_id: 'v_black',
              variant_key: 'color:black',
              discovery_log: {
                urls_checked: ['https://black.example'],
                queries_run: ['black query'],
                notes: ['keep note'],
              },
            },
          },
          {
            run_number: 2,
            selected: { candidates: [{ variant_id: 'v_white', value: '2025-02-02' }] },
            response: {
              variant_id: 'v_white',
              variant_key: 'color:white',
              discovery_log: {
                urls_checked: ['https://white.example'],
                queries_run: ['white query'],
              },
            },
          },
        ],
      },
    });

    const sqlUpdates = [];
    let deleteRunSqlCalled = false;
    let deleteAllRunsSqlCalled = false;
    const { ctx, calls, specDb, wsMessages } = makeCtx({
      config: { productRoot: ROUTE_TMP_ROOT },
      finderStore: {
        updateRunJson: (pid, runNumber, payload) => sqlUpdates.push({ pid, runNumber, payload }),
      },
    });
    ctx.readJsonBody = async () => ({ kind: 'url', scope: 'variant', variantId: 'v_black' });
    const handler = createFinderRouteHandler(makeFinderConfig({
      routePrefix: 'release-date-finder',
      moduleId: 'releaseDateFinder',
      fieldKeys: ['release_date'],
      getOne: () => ({ product_id: productId, category: 'cat', latest_ran_at: '', run_count: 2 }),
      deleteRunSql: () => { deleteRunSqlCalled = true; },
      deleteAllRunsSql: () => { deleteAllRunsSqlCalled = true; },
    }))(ctx);

    await handler(['release-date-finder', 'cat', productId, 'discovery-history', 'scrub'], new Map(), 'POST', {}, {});

    assert.equal(calls[0].status, 200);
    assert.equal(calls[0].body.ok, true);
    assert.equal(calls[0].body.runsTouched, 1);
    assert.equal(calls[0].body.urlsRemoved, 1);
    assert.equal(calls[0].body.queriesRemoved, 0);
    assert.deepEqual(calls[0].body.affectedRunNumbers, [1]);
    assert.equal(specDb._candidateDeleteCalls.length, 0);
    assert.equal(deleteRunSqlCalled, false);
    assert.equal(deleteAllRunsSqlCalled, false);
    assert.deepEqual(sqlUpdates.map((u) => u.runNumber), [1]);

    const afterDoc = readFinderDoc(productId, filePrefix);
    assert.equal(afterDoc.run_count, 2);
    assert.deepEqual(afterDoc.runs.map((r) => r.run_number), [1, 2]);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.urls_checked, []);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.queries_run, ['black query']);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.notes, ['keep note']);
    assert.deepEqual(afterDoc.runs[1].response.discovery_log.urls_checked, ['https://white.example']);

    const events = wsMessages
      .filter((m) => m.channel === 'data-change')
      .map((m) => m.data.event);
    assert.ok(events.includes('release-date-finder-discovery-history-scrubbed'));
  });

  it('DELETE single run with skipSelectedOnDelete calls updateBookkeeping instead of upsertSummary', async () => {
    const upsertCalls = [];
    const bookkeepingCalls = [];
    const { ctx } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRun: () => ({ run_count: 2, selected: { colors: ['red'] }, last_ran_at: '2026-04-14' }),
      skipSelectedOnDelete: true,
      upsertSummary: (_specDb, row) => upsertCalls.push(row),
      updateBookkeeping: (_specDb, pid, vals) => bookkeepingCalls.push({ pid, ...vals }),
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', '1'], new Map(), 'DELETE', {}, {});
    assert.equal(upsertCalls.length, 0, 'upsertSummary must NOT be called');
    assert.equal(bookkeepingCalls.length, 1, 'updateBookkeeping must be called once');
    assert.equal(bookkeepingCalls[0].pid, 'p1');
    assert.equal(bookkeepingCalls[0].latest_ran_at, '2026-04-14');
    assert.equal(bookkeepingCalls[0].run_count, 2);
  });

  it('DELETE batch with skipSelectedOnDelete calls updateBookkeeping instead of upsertSummary', async () => {
    const upsertCalls = [];
    const bookkeepingCalls = [];
    const { ctx } = makeCtx();
    ctx.readJsonBody = async () => ({ runNumbers: [1, 2] });
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRuns: () => ({ run_count: 1, selected: { colors: ['blue'] }, last_ran_at: '2026-04-14' }),
      skipSelectedOnDelete: true,
      upsertSummary: (_specDb, row) => upsertCalls.push(row),
      updateBookkeeping: (_specDb, pid, vals) => bookkeepingCalls.push({ pid, ...vals }),
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', 'batch'], new Map(), 'DELETE', {}, {});
    assert.equal(upsertCalls.length, 0, 'upsertSummary must NOT be called');
    assert.equal(bookkeepingCalls.length, 1, 'updateBookkeeping must be called once');
    assert.equal(bookkeepingCalls[0].run_count, 1);
  });

  it('DELETE single run WITHOUT skipSelectedOnDelete still uses upsertSummary', async () => {
    const upsertCalls = [];
    const bookkeepingCalls = [];
    const { ctx } = makeCtx();
    const handler = createFinderRouteHandler(makeFinderConfig({
      deleteRun: () => ({ run_count: 1, selected: { colors: ['red'] }, last_ran_at: '2026-04-14' }),
      upsertSummary: (_specDb, row) => upsertCalls.push(row),
      updateBookkeeping: (_specDb, pid, vals) => bookkeepingCalls.push({ pid, ...vals }),
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'runs', '1'], new Map(), 'DELETE', {}, {});
    assert.equal(upsertCalls.length, 1, 'upsertSummary must be called');
    assert.equal(bookkeepingCalls.length, 0, 'updateBookkeeping must NOT be called');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Extended config: parseVariantKey + loop (merged from createVariantFieldLoopHandler)
// ─────────────────────────────────────────────────────────────────────────────

describe('createFinderRouteHandler — parseVariantKey (opt-in per-variant POST)', () => {
  it('forwards body.variant_key as opts.variantKey to runFinder when parseVariantKey:true', async () => {
    let captured = null;
    const { ctx } = makeCtx();
    ctx.readJsonBody = async () => ({ variant_key: 'color:black' });
    const handler = createFinderRouteHandler(makeFinderConfig({
      parseVariantKey: true,
      runFinder: async (opts) => { captured = opts; return { rejected: false }; },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    assert.equal(captured?.variantKey, 'color:black');
  });

  it('forwards productRow.base_model as opts.product.base_model unconditionally (both with and without parseVariantKey)', async () => {
    // WHY: base_model is identity — the ambiguity resolver needs it to detect
    // sibling models. Gating it on parseVariantKey was the root cause of the
    // M75 Corsair sibling-injection bug where CEF saw empty siblings despite
    // 3 matching rows in specDb.
    let capturedWith = null;
    const { ctx: ctxA } = makeCtx();
    ctxA.readJsonBody = async () => ({ variant_key: null });
    const handlerWith = createFinderRouteHandler(makeFinderConfig({
      parseVariantKey: true,
      runFinder: async (opts) => { capturedWith = opts; return { rejected: false }; },
    }))(ctxA);
    await handlerWith(['test-finder', 'cat', 'p1'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    assert.equal(capturedWith?.product.base_model, 'BM');

    let capturedWithout = null;
    const { ctx: ctxB } = makeCtx();
    ctxB.readJsonBody = async () => ({ variant_key: null });
    const handlerWithout = createFinderRouteHandler(makeFinderConfig({
      // parseVariantKey intentionally omitted
      runFinder: async (opts) => { capturedWithout = opts; return { rejected: false }; },
    }))(ctxB);
    await handlerWithout(['test-finder', 'cat', 'p1'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    assert.equal(capturedWithout?.product.base_model, 'BM', 'base_model must be forwarded even without parseVariantKey');
  });

  it('without parseVariantKey, opts.variantKey is still undefined (variant-key parsing is opt-in, base_model is not)', async () => {
    let captured = null;
    const { ctx } = makeCtx();
    ctx.readJsonBody = async () => ({ variant_key: 'ignored' });
    const handler = createFinderRouteHandler(makeFinderConfig({
      // parseVariantKey intentionally omitted
      runFinder: async (opts) => { captured = opts; return { rejected: false }; },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    assert.equal(captured?.variantKey, undefined, 'non-opt-in must NOT forward variantKey');
  });

  it('op registered with variantKey field when parseVariantKey:true', async () => {
    const { ctx, wsMessages } = makeCtx();
    ctx.readJsonBody = async () => ({ variant_key: 'color:red' });
    const handler = createFinderRouteHandler(makeFinderConfig({
      parseVariantKey: true,
      runFinder: async () => ({ rejected: false }),
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    const op = getOperationsUpserts(wsMessages)[0];
    assert.ok(op, 'op must be registered');
    assert.equal(op.variantKey, 'color:red');
    assert.ok(!op.subType, 'single-shot must not have subType');
  });
});

describe('createFinderRouteHandler — loop (merged from createVariantFieldLoopHandler)', () => {
  it('POST /loop dispatches to loop.orchestrator (not runFinder) when loop config is set', async () => {
    let runFinderCalled = false;
    let loopOrchCalled = false;
    const { ctx } = makeCtx();
    ctx.readJsonBody = async () => ({});
    const handler = createFinderRouteHandler(makeFinderConfig({
      runFinder: async () => { runFinderCalled = true; return { rejected: false }; },
      loop: {
        orchestrator: async () => { loopOrchCalled = true; return { rejected: false }; },
      },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'loop'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    assert.equal(loopOrchCalled, true, 'loop orchestrator fires on /loop');
    assert.equal(runFinderCalled, false, 'runFinder must NOT fire on /loop');
  });

  it('POST /loop op registered with subType:"loop" and body.variant_key', async () => {
    const { ctx, wsMessages } = makeCtx();
    ctx.readJsonBody = async () => ({ variant_key: 'color:white' });
    const handler = createFinderRouteHandler(makeFinderConfig({
      loop: { orchestrator: async () => ({ rejected: false }) },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'loop'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    const op = getOperationsUpserts(wsMessages)[0];
    assert.ok(op, 'op registered');
    assert.equal(op.subType, 'loop');
    assert.equal(op.variantKey, 'color:white');
  });

  it('POST /loop stages default to ["Discovery","Validate","Publish"]', async () => {
    const { ctx, wsMessages } = makeCtx();
    ctx.readJsonBody = async () => ({});
    const handler = createFinderRouteHandler(makeFinderConfig({
      loop: { orchestrator: async () => ({ rejected: false }) },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'loop'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    const op = getOperationsUpserts(wsMessages)[0];
    const stageNames = op.stages.map((s) => s.name || s);
    assert.deepEqual(stageNames, ['Discovery', 'Validate', 'Publish']);
  });

  it('POST /loop stages honor loop.stages override', async () => {
    const { ctx, wsMessages } = makeCtx();
    ctx.readJsonBody = async () => ({});
    const handler = createFinderRouteHandler(makeFinderConfig({
      loop: {
        orchestrator: async () => ({ rejected: false }),
        stages: ['Fetch', 'Process', 'Done'],
      },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'loop'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    const op = getOperationsUpserts(wsMessages)[0];
    const stageNames = op.stages.map((s) => s.name || s);
    assert.deepEqual(stageNames, ['Fetch', 'Process', 'Done']);
  });

  it('POST /loop wires onLoopProgress → updateLoopProgress (observable on op)', async () => {
    const { ctx, wsMessages } = makeCtx();
    ctx.readJsonBody = async () => ({});
    const handler = createFinderRouteHandler(makeFinderConfig({
      loop: {
        orchestrator: async (opts) => {
          // Stub orchestrator invokes onLoopProgress to verify the wiring
          opts.onLoopProgress({ variantKey: 'v1', attempt: 1, budget: 3, satisfied: false });
          return { rejected: false };
        },
      },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'loop'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    // Operations registry broadcasts 'upsert' on every mutation, including
    // updateLoopProgress. After the callback fires, at least one upsert must
    // carry loopProgress in its payload.
    const upserts = getOperationsUpserts(wsMessages);
    const withProgress = upserts.find((op) => op.loopProgress && op.loopProgress.variantKey === 'v1');
    assert.ok(withProgress, 'updateLoopProgress must record the loopProgress payload on the op');
    assert.equal(withProgress.loopProgress.attempt, 1);
    assert.equal(withProgress.loopProgress.budget, 3);
  });

  it('POST /loop forwards body.variant_key as opts.variantKey + product.base_model to orchestrator', async () => {
    let captured = null;
    const { ctx } = makeCtx();
    ctx.readJsonBody = async () => ({ variant_key: 'color:blue' });
    const handler = createFinderRouteHandler(makeFinderConfig({
      loop: {
        orchestrator: async (opts) => { captured = opts; return { rejected: false }; },
      },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'loop'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    assert.equal(captured?.variantKey, 'color:blue');
    assert.equal(captured?.product.base_model, 'BM');
  });

  it('POST /loop emits WS data-change event "{prefix}-loop"', async () => {
    const { ctx, wsMessages } = makeCtx();
    ctx.readJsonBody = async () => ({});
    const handler = createFinderRouteHandler(makeFinderConfig({
      loop: { orchestrator: async () => ({ rejected: false }) },
    }))(ctx);
    await handler(['test-finder', 'cat', 'p1', 'loop'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    const events = wsMessages
      .filter((m) => m.channel === 'data-change')
      .map((m) => m.data);
    const loopEvent = events.find((e) => e.event === 'test-finder-loop');
    assert.ok(loopEvent, 'test-finder-loop data-change event must fire');
  });

  it('POST /loop without loop config falls through (handler returns false — legacy single-shot only)', async () => {
    let runFinderCalled = false;
    const { ctx, calls } = makeCtx();
    ctx.readJsonBody = async () => ({});
    const handler = createFinderRouteHandler(makeFinderConfig({
      // no loop config — /loop must not be absorbed
      runFinder: async () => { runFinderCalled = true; return { rejected: false }; },
    }))(ctx);
    const result = await handler(['test-finder', 'cat', 'p1', 'loop'], new Map(), 'POST', {}, {});
    await flushAsyncWork();
    assert.equal(result, false, 'unmatched route must return false');
    assert.equal(runFinderCalled, false, 'runFinder must not fire on unmatched /loop');
    assert.equal(calls.length, 0, 'no response written for unmatched path');
  });
});
