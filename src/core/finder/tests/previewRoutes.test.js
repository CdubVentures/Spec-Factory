import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFinderRouteHandler } from '../finderRoutes.js';
import { initOperationsRegistry } from '../../operations/index.js';

function makeJsonCapture() {
  const calls = [];
  const jsonRes = (res, status, body) => { calls.push({ status, body }); return true; };
  return { jsonRes, calls };
}

function makeSpecDbStub(overrides = {}) {
  return {
    getProduct: () => overrides.productRow ?? { product_id: 'p1', category: 'cat', brand: 'B', model: 'M', base_model: 'BM', variant: '' },
    getCompiledRules: () => ({ fields: { field_a: { key: 'field_a' } } }),
    category: 'cat',
  };
}

function baseConfig(overrides = {}) {
  return {
    routePrefix: 'test-finder',
    moduleType: 'tf',
    phase: 'testFinder',
    fieldKeys: ['field_a'],
    runFinder: async () => ({}),
    deleteRun: () => null,
    deleteAll: () => ({ deleted: true }),
    getOne: () => ({ product_id: 'p1' }),
    listByCategory: () => [],
    listRuns: () => [],
    upsertSummary: () => {},
    deleteOneSql: () => {},
    deleteRunSql: () => {},
    deleteAllRunsSql: () => {},
    ...overrides,
  };
}

function makeCtx(specDb = makeSpecDbStub(), readJsonBody = async () => ({})) {
  const { jsonRes, calls } = makeJsonCapture();
  const wsMessages = [];
  const broadcastWs = (channel, data) => { wsMessages.push({ channel, data }); };
  initOperationsRegistry({ broadcastWs });
  return {
    ctx: {
      jsonRes,
      readJsonBody,
      config: { knob: 'value' },
      appDb: { listColors: () => [] },
      getSpecDb: () => specDb,
      broadcastWs,
      logger: null,
    },
    calls,
  };
}

describe('POST /preview-prompt — generic handler', () => {
  it('returns 200 and the envelope from compilePrompt on happy path', async () => {
    let captured = null;
    const compilePrompt = async (ctx) => {
      captured = ctx;
      return { finder: 'tf', mode: 'run', compiled_at: 42, prompts: [{ label: 'x', system: 'SYS', user: 'USR', schema: {}, model: { id: 'm' }, notes: [] }], inputs_resolved: {} };
    };
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(baseConfig({ preview: { compilePrompt } }))(ctx);

    const handled = await handler(['test-finder', 'cat', 'p1', 'preview-prompt'], new Map(), 'POST', {}, {});

    assert.equal(handled, true);
    assert.equal(calls[0].status, 200);
    assert.equal(calls[0].body.finder, 'tf');
    assert.equal(calls[0].body.prompts[0].system, 'SYS');
    assert.ok(captured, 'compilePrompt should have been invoked');
    assert.equal(captured.productId, 'p1');
    assert.equal(captured.category, 'cat');
    assert.deepEqual(captured.config, { knob: 'value' });
    assert.ok(captured.product, 'product resolved from specDb.getProduct');
  });

  it('falls through (returns false) when feature has not opted into preview', async () => {
    const { ctx } = makeCtx();
    const handler = createFinderRouteHandler(baseConfig())(ctx);
    // No `preview` key → the branch is skipped; the subsequent POST-run branch
    // also does not match `preview-prompt`, so the handler eventually falls
    // through. Assert that we don't get a 200 envelope back.
    const handled = await handler(['test-finder', 'cat', 'p1', 'preview-prompt'], new Map(), 'POST', {}, {});
    assert.notEqual(handled, true);
  });

  it('returns 404 when product is not found', async () => {
    const specDb = { getProduct: () => null, getCompiledRules: () => ({ fields: {} }), category: 'cat' };
    const { ctx, calls } = makeCtx(specDb);
    const handler = createFinderRouteHandler(baseConfig({
      preview: { compilePrompt: async () => ({}) },
    }))(ctx);

    await handler(['test-finder', 'cat', 'missing', 'preview-prompt'], new Map(), 'POST', {}, {});

    assert.equal(calls[0].status, 404);
    assert.equal(calls[0].body.error, 'product not found');
  });

  it('returns 503 when specDb is not ready', async () => {
    const { jsonRes, calls } = makeJsonCapture();
    const wsMessages = [];
    const broadcastWs = (channel, data) => { wsMessages.push({ channel, data }); };
    initOperationsRegistry({ broadcastWs });
    const ctx = {
      jsonRes,
      readJsonBody: async () => ({}),
      config: {},
      appDb: { listColors: () => [] },
      getSpecDb: () => null,
      broadcastWs,
      logger: null,
    };
    const handler = createFinderRouteHandler(baseConfig({
      preview: { compilePrompt: async () => ({}) },
    }))(ctx);

    await handler(['test-finder', 'cat', 'p1', 'preview-prompt'], new Map(), 'POST', {}, {});

    assert.equal(calls[0].status, 503);
    assert.equal(calls[0].body.error, 'specDb not ready');
  });

  it('returns 500 with error envelope when compilePrompt throws', async () => {
    const { ctx, calls } = makeCtx();
    const handler = createFinderRouteHandler(baseConfig({
      preview: { compilePrompt: async () => { throw new Error('compilation blew up'); } },
    }))(ctx);

    await handler(['test-finder', 'cat', 'p1', 'preview-prompt'], new Map(), 'POST', {}, {});

    assert.equal(calls[0].status, 500);
    assert.equal(calls[0].body.error, 'preview failed');
    assert.equal(calls[0].body.message, 'compilation blew up');
  });

  it('returns 403 when required field is disabled in field studio', async () => {
    const specDb = {
      getProduct: () => ({ product_id: 'p1', category: 'cat', brand: 'B' }),
      getCompiledRules: () => ({ fields: { /* empty — required field missing */ } }),
      category: 'cat',
    };
    const { ctx, calls } = makeCtx(specDb);
    const handler = createFinderRouteHandler(baseConfig({
      requiredFields: ['field_a'],
      preview: { compilePrompt: async () => ({ ok: true }) },
    }))(ctx);

    await handler(['test-finder', 'cat', 'p1', 'preview-prompt'], new Map(), 'POST', {}, {});

    assert.equal(calls[0].status, 403);
    assert.match(calls[0].body.error, /field_a.*not enabled/);
  });

  it('forwards request body into compilePrompt ctx.body', async () => {
    let captured = null;
    const compilePrompt = async (ctx) => { captured = ctx; return { ok: true }; };
    const { ctx } = makeCtx(undefined, async () => ({ variant_key: 'Black', mode: 'view' }));
    const handler = createFinderRouteHandler(baseConfig({
      preview: { compilePrompt },
    }))(ctx);

    await handler(['test-finder', 'cat', 'p1', 'preview-prompt'], new Map(), 'POST', {}, {});

    assert.deepEqual(captured.body, { variant_key: 'Black', mode: 'view' });
  });
});
