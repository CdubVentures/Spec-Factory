import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerColorEditionFinderRoutes } from '../colorEditionFinderRoutes.js';

function makeJsonCapture() {
  const calls = [];
  const jsonRes = (res, status, body) => {
    calls.push({ status, body });
    return true;
  };
  return { jsonRes, calls };
}

function makeSpecDbStub(finderRow = null, listRows = [], productRow = null, runRows = []) {
  const candidateDeleteCalls = [];
  const candidateDeleteByValueCalls = [];
  const candidateUpsertCalls = [];
  return {
    getColorEditionFinder: () => finderRow,
    listColorEditionFinderByCategory: () => listRows,
    listColorEditionFinderRuns: () => runRows,
    getColorEditionFinderIfOnCooldown: () => null,
    getProduct: () => productRow ?? { product_id: 'mouse-001', category: 'mouse', brand: 'Corsair', model: 'M75 Air Wireless', variant: '' },
    upsertColorEditionFinder: () => {},
    deleteColorEditionFinder: () => {},
    deleteColorEditionFinderRunByNumber: () => {},
    deleteAllColorEditionFinderRuns: () => {},
    insertColorEditionFinderRun: () => {},
    deleteFieldCandidatesByProductAndField: (...args) => { candidateDeleteCalls.push(args); },
    // Source-aware cleanup support
    getFieldCandidatesByProductAndField: () => [
      { id: 1, value: '["black"]', confidence: 100, source_count: 1, sources_json: [{ source: 'cef', confidence: 100 }], validation_json: {}, metadata_json: {}, status: 'resolved', unit: null },
    ],
    deleteFieldCandidateByValue: (...args) => { candidateDeleteByValueCalls.push(args); },
    upsertFieldCandidate: (...args) => { candidateUpsertCalls.push(args); },
    _candidateDeleteCalls: candidateDeleteCalls,
    _candidateDeleteByValueCalls: candidateDeleteByValueCalls,
    _candidateUpsertCalls: candidateUpsertCalls,
    category: 'mouse',
  };
}

function makeAppDbStub() {
  return {
    listColors: () => [
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ],
  };
}

function makeCtx(overrides = {}) {
  const { jsonRes, calls } = makeJsonCapture();
  const specDb = makeSpecDbStub(overrides.finderRow, overrides.listRows, null, overrides.runRows);
  return {
    ctx: {
      jsonRes,
      readJsonBody: async () => ({}),
      config: {},
      appDb: makeAppDbStub(),
      getSpecDb: () => specDb,
      broadcastWs: () => {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      runColorEditionFinder: overrides.runFn || (async () => ({
        colors: ['black'], editions: {}, default_color: 'black', fallbackUsed: false,
      })),
      deleteColorEditionFinderRun: overrides.deleteRunFn || (() => null),
      deleteColorEditionFinderAll: overrides.deleteAllFn || (() => ({ deleted: true })),
    },
    calls,
    specDb,
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
    });
  });

  describe('GET /color-edition-finder/:category/:productId', () => {
    it('returns finder result with runs from SQL', async () => {
      const finderRow = {
        category: 'mouse', product_id: 'mouse-001',
        colors: ['black', 'white'], editions: ['launch-edition'],
        default_color: 'black', cooldown_until: '', latest_ran_at: '2026-04-01T00:00:00Z', run_count: 2,
      };
      const runRows = [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
        fallback_used: false, cooldown_until: '',
        selected: { colors: ['black', 'white'], editions: { 'launch-edition': { colors: ['black'] } }, default_color: 'black' },
        prompt: { system: 'test', user: '{}' }, response: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
      }];
      const { ctx, calls } = makeCtx({ finderRow, runRows });
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'GET', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 200);
      assert.ok(calls[0].body.selected);
      assert.deepEqual(calls[0].body.selected.colors, ['black', 'white']);
      assert.ok(Array.isArray(calls[0].body.runs));
      assert.equal(calls[0].body.runs.length, 1);
      assert.equal(calls[0].body.runs[0].model, 'gpt-5.4');
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
    it('triggers finder and returns result with editions object', async () => {
      let runCalled = false;
      const runFn = async () => {
        runCalled = true;
        return { colors: ['black', 'white'], editions: { 'launch': { colors: ['black'] } }, default_color: 'black', fallbackUsed: false };
      };
      const { ctx, calls } = makeCtx({ runFn });
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'POST', {}, {});
      assert.equal(result, true);
      assert.ok(runCalled);
      assert.equal(calls[0].status, 200);
      assert.equal(calls[0].body.ok, true);
      assert.deepEqual(calls[0].body.colors, ['black', 'white']);
      assert.ok(calls[0].body.editions);
      assert.equal(calls[0].body.default_color, 'black');
    });
  });

  describe('DELETE /color-edition-finder/:category/:productId/runs/:runNumber', () => {
    it('deletes a run and returns remaining count', async () => {
      let deletedRun = null;
      const deleteRunFn = ({ runNumber }) => {
        deletedRun = runNumber;
        return { run_count: 1, selected: { colors: ['black'], editions: {}, default_color: 'black' }, cooldown_until: '', last_ran_at: '' };
      };
      const { ctx, calls } = makeCtx({ deleteRunFn });
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001', 'runs', '2'], new Map(), 'DELETE', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 200);
      assert.equal(calls[0].body.ok, true);
      assert.equal(calls[0].body.remaining_runs, 1);
      assert.equal(deletedRun, 2);
    });

    it('does NOT delete candidates on single-run deletion', async () => {
      const deleteRunFn = () => ({ run_count: 1, selected: { colors: ['black'], editions: {}, default_color: 'black' }, cooldown_until: '', last_ran_at: '' });
      const { ctx, specDb } = makeCtx({ deleteRunFn });
      const handler = registerColorEditionFinderRoutes(ctx);
      await handler(['color-edition-finder', 'mouse', 'mouse-001', 'runs', '2'], new Map(), 'DELETE', {}, {});
      assert.equal(specDb._candidateDeleteCalls.length, 0, 'candidates must NOT be deleted on single-run delete');
    });

    it('rejects invalid run number', async () => {
      const { ctx, calls } = makeCtx();
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001', 'runs', 'abc'], new Map(), 'DELETE', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 400);
    });
  });

  describe('DELETE /color-edition-finder/:category/:productId', () => {
    it('deletes all data and returns ok', async () => {
      let allDeleted = false;
      const deleteAllFn = () => { allDeleted = true; return { deleted: true }; };
      const { ctx, calls } = makeCtx({ deleteAllFn });
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'DELETE', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 200);
      assert.equal(calls[0].body.ok, true);
      assert.ok(allDeleted);
    });

    it('deletes candidates on delete-all', async () => {
      const deleteAllFn = () => ({ deleted: true });
      const { ctx, specDb } = makeCtx({ deleteAllFn });
      const handler = registerColorEditionFinderRoutes(ctx);
      await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'DELETE', {}, {});
      // Source-aware cleanup: CEF-only candidates are deleted by value, not blanket
      assert.ok(
        specDb._candidateDeleteByValueCalls.length > 0,
        'CEF-only candidates MUST be deleted on delete-all via source-aware cleanup',
      );
    });
  });
});
