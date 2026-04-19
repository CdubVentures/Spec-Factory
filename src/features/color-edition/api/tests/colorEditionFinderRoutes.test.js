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
  const removeRunCalls = [];
  const removeAllRunsCalls = [];
  const finderStore = {
    get: () => finderRow,
    listByCategory: () => listRows,
    listRuns: () => runRows,
    upsert: () => {},
    remove: () => {},
    removeRun: (pid, rn) => { removeRunCalls.push({ productId: pid, runNumber: rn }); },
    removeAllRuns: (pid) => { removeAllRunsCalls.push({ productId: pid }); },
    insertRun: () => {},
    updateBookkeeping: () => {},
    updateSummaryField: () => {},
  };
  return {
    getFinderStore: () => finderStore,
    getColorEditionFinder: () => finderRow,
    listColorEditionFinderByCategory: () => listRows,
    listColorEditionFinderRuns: () => runRows,
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
    variants: { listActive: () => [], listByProduct: () => [] },
    _candidateDeleteCalls: candidateDeleteCalls,
    _candidateDeleteByValueCalls: candidateDeleteByValueCalls,
    _candidateUpsertCalls: candidateUpsertCalls,
    _removeRunCalls: removeRunCalls,
    _removeAllRunsCalls: removeAllRunsCalls,
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
        { category: 'mouse', product_id: 'mouse-001', colors: ['black'], editions: [], default_color: 'black', latest_ran_at: '', run_count: 1 },
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
        default_color: 'black', latest_ran_at: '2026-04-01T00:00:00Z', run_count: 2,
      };
      const runRows = [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
        fallback_used: false,
        selected: { colors: ['black', 'white'], editions: { 'launch-edition': { colors: ['black'] } }, default_color: 'black' },
        prompt: { system: 'test', user: '{}' }, response: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
      }];
      const { ctx, calls } = makeCtx({ finderRow, runRows });
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'GET', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 200);
      assert.ok(calls[0].body.published);
      assert.deepEqual(calls[0].body.published.colors, ['black', 'white']);
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
    it('triggers finder and returns 202 with operationId', async () => {
      const { ctx, calls } = makeCtx();
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'POST', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 202);
      assert.equal(calls[0].body.ok, true);
      assert.ok(calls[0].body.operationId, 'response must include operationId');
    });
  });

  describe('DELETE /color-edition-finder/:category/:productId/runs/:runNumber', () => {
    it('deletes a run and returns remaining count', async () => {
      const { ctx, calls, specDb } = makeCtx();
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001', 'runs', '2'], new Map(), 'DELETE', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 200);
      assert.equal(calls[0].body.ok, true);
      assert.equal(typeof calls[0].body.remaining_runs, 'number');
      assert.equal(specDb._removeRunCalls.length, 1, 'SQL removeRun must be invoked');
      assert.equal(specDb._removeRunCalls[0].productId, 'mouse-001');
      assert.equal(specDb._removeRunCalls[0].runNumber, 2);
    });

    it('does NOT delete candidates on single-run deletion', async () => {
      const { ctx, specDb } = makeCtx();
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
      const { ctx, calls, specDb } = makeCtx();
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'DELETE', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 200);
      assert.equal(calls[0].body.ok, true);
      assert.equal(specDb._removeAllRunsCalls.length, 1, 'SQL removeAllRuns must be invoked');
      assert.equal(specDb._removeAllRunsCalls[0].productId, 'mouse-001');
    });

    it('deletes candidates on delete-all', async () => {
      const { ctx, specDb } = makeCtx();
      const handler = registerColorEditionFinderRoutes(ctx);
      await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'DELETE', {}, {});
      // Source-aware cleanup: CEF-only candidates are deleted by value, not blanket
      assert.ok(
        specDb._candidateDeleteByValueCalls.length > 0,
        'CEF-only candidates MUST be deleted on delete-all via source-aware cleanup',
      );
    });
  });

  describe('GET published.color_names / edition_details derived from variants', () => {
    // WHY: color_names and edition_details must come from the variants table,
    // not from selected (run snapshot). This prevents drift when runs are deleted.

    it('A: GET returns variant-derived color_names, not run-derived', async () => {
      const finderRow = {
        category: 'mouse', product_id: 'mouse-001',
        colors: ['black', 'white'], editions: [],
        default_color: 'black', latest_ran_at: '2026-04-01T00:00:00Z', run_count: 1,
      };
      const runRows = [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4', fallback_used: false,
        // WHY: selected has WRONG color_names — the bug we're fixing
        selected: { colors: ['black', 'white'], editions: {}, default_color: 'black', color_names: { black: 'WRONG-FROM-RUN' } },
        prompt: {}, response: {},
      }];
      const { ctx, calls, specDb } = makeCtx({ finderRow, runRows });
      // Stub variants with correct labels
      specDb.variants.listActive = () => [
        { variant_type: 'color', variant_key: 'color:black', color_atoms: ['black'], variant_label: 'Black', edition_slug: null },
        { variant_type: 'color', variant_key: 'color:white', color_atoms: ['white'], variant_label: 'White', edition_slug: null },
      ];
      const handler = registerColorEditionFinderRoutes(ctx);
      await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'GET', {}, {});

      assert.equal(calls[0].status, 200);
      assert.deepEqual(calls[0].body.published.color_names, { black: 'Black', white: 'White' });
    });

    it('B: GET returns variant-derived edition_details, not run-derived', async () => {
      const finderRow = {
        category: 'mouse', product_id: 'mouse-001',
        colors: ['black'], editions: ['special-ed'],
        default_color: 'black', latest_ran_at: '2026-04-01T00:00:00Z', run_count: 1,
      };
      const runRows = [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4', fallback_used: false,
        // WHY: selected has WRONG edition details — the bug we're fixing
        selected: { colors: ['black'], editions: { 'special-ed': { display_name: 'WRONG-FROM-RUN', colors: [] } }, default_color: 'black' },
        prompt: {}, response: {},
      }];
      const { ctx, calls, specDb } = makeCtx({ finderRow, runRows });
      specDb.variants.listActive = () => [
        { variant_type: 'color', variant_key: 'color:black', color_atoms: ['black'], variant_label: 'Black', edition_slug: null },
        { variant_type: 'edition', color_atoms: ['olive', 'khaki'], variant_label: 'Special Edition', edition_slug: 'special-ed', edition_display_name: 'Special Edition' },
      ];
      const handler = registerColorEditionFinderRoutes(ctx);
      await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'GET', {}, {});

      assert.equal(calls[0].status, 200);
      assert.deepEqual(calls[0].body.published.edition_details, {
        'special-ed': { display_name: 'Special Edition', colors: ['olive+khaki'] },
      });
    });

    it('C: after run deletion, color_names/edition_details remain stable', async () => {
      const finderRow = {
        category: 'mouse', product_id: 'mouse-001',
        colors: ['black'], editions: ['special-ed'],
        default_color: 'black', latest_ran_at: '2026-04-01T00:00:00Z', run_count: 1,
      };
      // WHY: Simulate post-deletion state: selected is empty/stale, but variants are intact
      const runRows = [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4', fallback_used: false,
        selected: { colors: [], editions: {}, default_color: '', color_names: {} },
        prompt: {}, response: {},
      }];
      const { ctx, calls, specDb } = makeCtx({ finderRow, runRows });
      specDb.variants.listActive = () => [
        { variant_type: 'color', variant_key: 'color:black', color_atoms: ['black'], variant_label: 'Black', edition_slug: null },
        { variant_type: 'edition', color_atoms: ['olive'], variant_label: 'Special', edition_slug: 'special-ed', edition_display_name: 'Special Edition' },
      ];
      const handler = registerColorEditionFinderRoutes(ctx);
      await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'GET', {}, {});

      assert.equal(calls[0].status, 200);
      assert.deepEqual(calls[0].body.published.color_names, { black: 'Black' });
      assert.deepEqual(calls[0].body.published.edition_details, {
        'special-ed': { display_name: 'Special Edition', colors: ['olive'] },
      });
      // WHY: single atom = no '+' join needed, stays as ['olive']
    });

    it('D: no variants → empty color_names/edition_details', async () => {
      const finderRow = {
        category: 'mouse', product_id: 'mouse-001',
        colors: [], editions: [],
        default_color: '', latest_ran_at: '2026-04-01T00:00:00Z', run_count: 1,
      };
      const runRows = [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4', fallback_used: false,
        selected: { colors: [], editions: {}, default_color: '' },
        prompt: {}, response: {},
      }];
      const { ctx, calls, specDb } = makeCtx({ finderRow, runRows });
      specDb.variants.listActive = () => [];
      const handler = registerColorEditionFinderRoutes(ctx);
      await handler(['color-edition-finder', 'mouse', 'mouse-001'], new Map(), 'GET', {}, {});

      assert.equal(calls[0].status, 200);
      assert.deepEqual(calls[0].body.published.color_names, {});
      assert.deepEqual(calls[0].body.published.edition_details, {});
    });
  });

  describe('DELETE /color-edition-finder/:category/:productId/variants', () => {
    it('deletes all variants and returns count', async () => {
      const removedIds = [];
      const { ctx, calls, specDb } = makeCtx();
      const variantData = [
        { variant_id: 'v_aa', variant_key: 'color:black', variant_type: 'color', color_atoms: ['black'] },
        { variant_id: 'v_bb', variant_key: 'color:white', variant_type: 'color', color_atoms: ['white'] },
      ];
      // WHY: deleteAllVariants calls deleteVariant which calls specDb.variants.get/remove
      specDb.variants.listActive = () => [...variantData];
      specDb.variants.get = (pid, vid) => variantData.find(v => v.variant_id === vid) || null;
      specDb.variants.remove = (pid, vid) => { removedIds.push(vid); };
      // Stub remaining methods used by deleteVariant cascade
      specDb.getFieldCandidatesByProductAndField = () => [];
      specDb.deleteFieldCandidateBySourceId = () => {};
      specDb.updateFieldCandidateValue = () => {};
      specDb.deleteFieldCandidatesByVariantId = () => {};
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001', 'variants'], new Map(), 'DELETE', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 200);
      assert.equal(calls[0].body.deleted, 2);
      assert.deepEqual(removedIds, ['v_aa', 'v_bb']);
    });

    it('returns 200 with deleted 0 when no variants exist', async () => {
      const { ctx, calls, specDb } = makeCtx();
      specDb.variants.listActive = () => [];
      const handler = registerColorEditionFinderRoutes(ctx);
      const result = await handler(['color-edition-finder', 'mouse', 'mouse-001', 'variants'], new Map(), 'DELETE', {}, {});
      assert.equal(result, true);
      assert.equal(calls[0].status, 200);
      assert.equal(calls[0].body.deleted, 0);
    });
  });
});
