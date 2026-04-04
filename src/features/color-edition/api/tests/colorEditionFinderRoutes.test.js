import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerColorEditionFinderRoutes } from '../colorEditionFinderRoutes.js';

// Capture helper for jsonRes
function makeJsonCapture() {
  const calls = [];
  const jsonRes = (res, status, body) => {
    calls.push({ status, body });
    return true;
  };
  return { jsonRes, calls };
}

// Stub specDb
function makeSpecDbStub(finderRow = null, listRows = [], productRow = null) {
  return {
    getColorEditionFinder: () => finderRow,
    listColorEditionFinderByCategory: () => listRows,
    getColorEditionFinderIfOnCooldown: () => null,
    getProduct: () => productRow ?? { product_id: 'mouse-001', category: 'mouse', brand: 'Corsair', model: 'M75 Air Wireless', variant: '', seed_urls: '[]' },
    category: 'mouse',
  };
}

// Stub appDb
function makeAppDbStub() {
  return {
    listColors: () => [
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ],
    upsertColor: () => {},
  };
}

function makeCtx(overrides = {}) {
  const { jsonRes, calls } = makeJsonCapture();
  return {
    ctx: {
      jsonRes,
      readJsonBody: async () => ({}),
      config: {},
      appDb: makeAppDbStub(),
      getSpecDb: () => makeSpecDbStub(overrides.finderRow, overrides.listRows),
      broadcastWs: () => {},
      colorRegistryPath: null,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      runColorEditionFinder: overrides.runFn || (async () => ({
        colors: ['black'], editions: [], newColorsRegistered: [], fallbackUsed: false,
      })),
      readColorEdition: overrides.readFn || (() => null),
    },
    calls,
  };
}

describe('colorEditionFinderRoutes', () => {
  it('returns false for unrecognized path prefix', async () => {
    const { ctx } = makeCtx();
    const handler = registerColorEditionFinderRoutes(ctx);
    const result = await handler(['unknown'], new Map(), 'GET', {}, {});
    assert.equal(result, false);
  });

  describe('GET /color-edition-finder/:category', () => {
    it('returns list of finder results for category', async () => {
      const listRows = [
        { category: 'mouse', product_id: 'mouse-001', colors: ['black'], editions: [], default_color: 'black', cooldown_until: '', latest_ran_at: '', run_count: 1 },
      ];
      const { ctx, calls } = makeCtx({ listRows });
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse'], new Map(), 'GET', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 200);
      assert.ok(Array.isArray(calls[0].body));
      assert.equal(calls[0].body.length, 1);
    });

    it('returns empty array for category with no results', async () => {
      const { ctx, calls } = makeCtx({ listRows: [] });
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'keyboard'], new Map(), 'GET', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 200);
      assert.deepEqual(calls[0].body, []);
    });
  });

  describe('GET /color-edition-finder/:category/:productId', () => {
    it('returns finder result for product', async () => {
      const finderRow = {
        category: 'mouse', product_id: 'mouse-001',
        colors: ['black', 'white'], editions: ['launch-edition'],
        default_color: 'black', cooldown_until: '', latest_ran_at: '2026-04-01T00:00:00Z', run_count: 2,
      };
      const jsonData = {
        colors: { black: { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' } },
        editions: { 'launch-edition': { found_run: 2, found_at: '2026-05-01T00:00:00Z', model: 'gpt-5.4' } },
      };
      const { ctx, calls } = makeCtx({ finderRow, readFn: () => jsonData });
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'GET', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 200);
      assert.deepEqual(calls[0].body.colors, ['black', 'white']);
      assert.ok(calls[0].body.color_details);
      assert.equal(calls[0].body.on_cooldown, false);
    });

    it('returns 404 for unknown product', async () => {
      const { ctx, calls } = makeCtx({ finderRow: null });
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'nonexistent'], new Map(), 'GET', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 404);
    });
  });

  describe('POST /color-edition-finder/:category/:productId', () => {
    it('triggers finder and returns result', async () => {
      let runCalled = false;
      const runFn = async () => {
        runCalled = true;
        return { colors: ['black', 'white'], editions: [], newColorsRegistered: [], fallbackUsed: false };
      };
      const { ctx, calls } = makeCtx({ runFn });
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'POST', {}, {});
      assert.equal(result, true);
      assert.ok(runCalled);
      assert.equal(calls[0].status, 200);
      assert.equal(calls[0].body.ok, true);
      assert.deepEqual(calls[0].body.colors, ['black', 'white']);
    });
  });
});
